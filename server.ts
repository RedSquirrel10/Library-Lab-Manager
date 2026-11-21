import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import db, { initializeDatabase, syncOverdueAndFines } from './server/db.ts';

initializeDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(baseDateISO: string, days: number): string {
  const date = new Date(`${baseDateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Dashboard summary via relational aggregations
app.get('/api/dashboard', (_req, res) => {
  try {
    syncOverdueAndFines();
    const itemStats = db
      .prepare(`
        SELECT
          COUNT(*) AS total_titles,
          COALESCE(SUM(total_copies), 0) AS total_units,
          COALESCE(SUM(available_copies), 0) AS available_units
        FROM inventory_items
      `)
      .get() as { total_titles: number; total_units: number; available_units: number };

    const loanStats = db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN returned_at IS NULL THEN 1 ELSE 0 END), 0) AS active_loans,
          COALESCE(SUM(CASE WHEN returned_at IS NULL AND status = 'Overdue' THEN 1 ELSE 0 END), 0) AS overdue_loans
        FROM loans
      `)
      .get() as { active_loans: number; overdue_loans: number };

    const fineStats = db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_status IN ('Unpaid', 'Partial') THEN (amount_due - amount_paid) ELSE 0 END), 0) AS unpaid_fines_total,
          COALESCE(SUM(amount_paid), 0) AS collected_fines_total
        FROM fines
      `)
      .get() as { unpaid_fines_total: number; collected_fines_total: number };

    const borrowerStats = db
      .prepare(`SELECT COUNT(*) AS total_borrowers FROM borrowers`)
      .get() as { total_borrowers: number };

    const domainBreakdown = db
      .prepare(`
        SELECT
          i.domain,
          COUNT(DISTINCT i.item_id) AS titles,
          COALESCE(SUM(i.total_copies), 0) AS total_units,
          COALESCE(SUM(i.available_copies), 0) AS available_units,
          COALESCE(SUM(i.total_copies - i.available_copies), 0) AS active_loans
        FROM inventory_items i
        GROUP BY i.domain
        ORDER BY i.domain ASC
      `)
      .all();

    const categoryUtilization = db
      .prepare(`
        SELECT
          c.category_id,
          c.name,
          c.domain,
          c.daily_fine_rate,
          COALESCE(SUM(i.total_copies), 0) AS total_units,
          COALESCE(SUM(i.total_copies - i.available_copies), 0) AS checked_out_units,
          CASE
            WHEN COALESCE(SUM(i.total_copies), 0) = 0 THEN 0
            ELSE ROUND((COALESCE(SUM(i.total_copies - i.available_copies), 0) * 100.0) / SUM(i.total_copies), 1)
          END AS utilization_pct
        FROM categories c
        LEFT JOIN inventory_items i ON c.category_id = i.category_id
        GROUP BY c.category_id
        ORDER BY utilization_pct DESC, c.name ASC
      `)
      .all();

    res.json({
      ...itemStats,
      ...loanStats,
      unpaid_fines_total: Number(fineStats.unpaid_fines_total.toFixed(2)),
      collected_fines_total: Number(fineStats.collected_fines_total.toFixed(2)),
      total_borrowers: borrowerStats.total_borrowers,
      domain_breakdown: domainBreakdown,
      category_utilization: categoryUtilization,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Categories
app.get('/api/categories', (_req, res) => {
  try {
    const categories = db
      .prepare(`SELECT * FROM categories ORDER BY domain ASC, name ASC`)
      .all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Inventory Items (JOIN categories)
app.get('/api/items', (_req, res) => {
  try {
    const items = db
      .prepare(`
        SELECT
          i.*,
          c.name AS category_name,
          c.loan_period_days,
          c.daily_fine_rate
        FROM inventory_items i
        JOIN categories c ON i.category_id = c.category_id
        ORDER BY i.domain ASC, i.asset_code ASC
      `)
      .all();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/items', (req, res) => {
  try {
    const {
      asset_code,
      title,
      category_id,
      location_shelf,
      total_copies,
      unit_value,
      condition_status,
    } = req.body as {
      asset_code?: string;
      title?: string;
      category_id?: number;
      location_shelf?: string;
      total_copies?: number;
      unit_value?: number;
      condition_status?: string;
    };

    if (!asset_code?.trim() || !title?.trim() || !category_id || !location_shelf?.trim()) {
      res.status(400).json({ error: 'Asset code, title, category, and shelf/cabinet location are required.' });
      return;
    }

    const copies = Number(total_copies);
    if (!Number.isInteger(copies) || copies < 1) {
      res.status(400).json({ error: 'Total copies must be an integer of at least 1.' });
      return;
    }

    const category = db
      .prepare('SELECT category_id, domain FROM categories WHERE category_id = ?')
      .get(Number(category_id)) as { category_id: number; domain: string } | undefined;

    if (!category) {
      res.status(400).json({ error: 'Selected category does not exist.' });
      return;
    }

    const result = db
      .prepare(`
        INSERT INTO inventory_items (
          asset_code, title, domain, category_id, location_shelf,
          total_copies, available_copies, unit_value, condition_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        asset_code.trim().toUpperCase(),
        title.trim(),
        category.domain,
        category.category_id,
        location_shelf.trim(),
        copies,
        copies,
        Number(unit_value) || 0,
        condition_status || 'Excellent'
      );

    const created = db
      .prepare(`
        SELECT i.*, c.name AS category_name, c.loan_period_days, c.daily_fine_rate
        FROM inventory_items i
        JOIN categories c ON i.category_id = c.category_id
        WHERE i.item_id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'An item with this asset code already exists.' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

app.patch('/api/items/:id', (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const { total_copies, condition_status, location_shelf } = req.body as {
      total_copies?: number;
      condition_status?: string;
      location_shelf?: string;
    };

    const existing = db
      .prepare('SELECT * FROM inventory_items WHERE item_id = ?')
      .get(itemId) as
      | {
          item_id: number;
          total_copies: number;
          available_copies: number;
          condition_status: string;
          location_shelf: string;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Inventory item not found.' });
      return;
    }

    const checkedOutCount = existing.total_copies - existing.available_copies;
    const nextTotal = total_copies !== undefined ? Number(total_copies) : existing.total_copies;

    if (!Number.isInteger(nextTotal) || nextTotal < checkedOutCount) {
      res.status(400).json({
        error: `Cannot reduce total copies below currently checked-out count (${checkedOutCount}).`,
      });
      return;
    }

    const nextAvailable = nextTotal - checkedOutCount;
    const nextCondition = condition_status || existing.condition_status;
    const nextShelf = location_shelf?.trim() || existing.location_shelf;

    db.prepare(`
      UPDATE inventory_items
      SET total_copies = ?, available_copies = ?, condition_status = ?, location_shelf = ?
      WHERE item_id = ?
    `).run(nextTotal, nextAvailable, nextCondition, nextShelf, itemId);

    const updated = db
      .prepare(`
        SELECT i.*, c.name AS category_name, c.loan_period_days, c.daily_fine_rate
        FROM inventory_items i
        JOIN categories c ON i.category_id = c.category_id
        WHERE i.item_id = ?
      `)
      .get(itemId);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Borrowers (with relational counts)
app.get('/api/borrowers', (_req, res) => {
  try {
    syncOverdueAndFines();
    const borrowers = db
      .prepare(`
        SELECT
          b.*,
          COALESCE(l_agg.active_loans_count, 0) AS active_loans_count,
          ROUND(COALESCE(f_agg.unpaid_fines_total, 0), 2) AS unpaid_fines_total
        FROM borrowers b
        LEFT JOIN (
          SELECT borrower_id, COUNT(*) AS active_loans_count
          FROM loans
          WHERE returned_at IS NULL
          GROUP BY borrower_id
        ) l_agg ON b.borrower_id = l_agg.borrower_id
        LEFT JOIN (
          SELECT borrower_id, SUM(amount_due - amount_paid) AS unpaid_fines_total
          FROM fines
          WHERE payment_status IN ('Unpaid', 'Partial')
          GROUP BY borrower_id
        ) f_agg ON b.borrower_id = f_agg.borrower_id
        ORDER BY b.full_name ASC
      `)
      .all();
    res.json(borrowers);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/borrowers', (req, res) => {
  try {
    const {
      university_id,
      full_name,
      email,
      department,
      year_of_study,
      role,
      max_borrow_limit,
    } = req.body as {
      university_id?: string;
      full_name?: string;
      email?: string;
      department?: string;
      year_of_study?: string;
      role?: string;
      max_borrow_limit?: number;
    };

    if (!university_id?.trim() || !full_name?.trim() || !email?.trim() || !department?.trim()) {
      res.status(400).json({ error: 'University ID, full name, email, and department are required.' });
      return;
    }

    const result = db
      .prepare(`
        INSERT INTO borrowers (university_id, full_name, email, department, year_of_study, role, max_borrow_limit, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
      `)
      .run(
        university_id.trim().toUpperCase(),
        full_name.trim(),
        email.trim().toLowerCase(),
        department.trim(),
        year_of_study?.trim() || '2nd Year',
        role || 'Student',
        Number(max_borrow_limit) || 4
      );

    const created = db
      .prepare(`
        SELECT *, 0 AS active_loans_count, 0 AS unpaid_fines_total
        FROM borrowers WHERE borrower_id = ?
      `)
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'A borrower with this University ID or email already exists.' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// Loans (3-table JOIN: loans + inventory_items + categories + borrowers)
app.get('/api/loans', (_req, res) => {
  try {
    syncOverdueAndFines();
    const today = todayISO();
    const loans = db
      .prepare(`
        SELECT
          l.loan_id,
          l.item_id,
          i.asset_code,
          i.title AS item_title,
          i.domain,
          c.name AS category_name,
          c.daily_fine_rate,
          l.borrower_id,
          b.university_id,
          b.full_name AS borrower_name,
          b.department,
          l.borrowed_at,
          l.due_date,
          l.returned_at,
          l.status,
          l.notes,
          CASE
            WHEN l.returned_at IS NOT NULL THEN
              MAX(0, CAST(julianday(l.returned_at) - julianday(l.due_date) AS INTEGER))
            ELSE
              MAX(0, CAST(julianday(?) - julianday(l.due_date) AS INTEGER))
          END AS days_overdue,
          ROUND(
            CASE
              WHEN l.returned_at IS NOT NULL THEN
                MAX(0, CAST(julianday(l.returned_at) - julianday(l.due_date) AS INTEGER)) * c.daily_fine_rate
              ELSE
                MAX(0, CAST(julianday(?) - julianday(l.due_date) AS INTEGER)) * c.daily_fine_rate
            END,
            2
          ) AS accrued_fine
        FROM loans l
        JOIN inventory_items i ON l.item_id = i.item_id
        JOIN categories c ON i.category_id = c.category_id
        JOIN borrowers b ON l.borrower_id = b.borrower_id
        ORDER BY
          CASE l.status WHEN 'Overdue' THEN 0 WHEN 'Active' THEN 1 ELSE 2 END,
          l.due_date ASC,
          l.loan_id DESC
      `)
      .all(today, today);

    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Transactional Borrowing
app.post('/api/loans', (req, res) => {
  try {
    syncOverdueAndFines();
    const { item_id, borrower_id, custom_days, notes } = req.body as {
      item_id?: number;
      borrower_id?: number;
      custom_days?: number;
      notes?: string;
    };

    if (!item_id || !borrower_id) {
      res.status(400).json({ error: 'Both item and borrower must be selected.' });
      return;
    }

    const checkoutTx = db.transaction(() => {
      const borrower = db
        .prepare('SELECT * FROM borrowers WHERE borrower_id = ?')
        .get(Number(borrower_id)) as
        | {
            borrower_id: number;
            full_name: string;
            max_borrow_limit: number;
            status: string;
          }
        | undefined;

      if (!borrower) {
        throw new Error('Selected borrower record does not exist.');
      }

      if (borrower.status === 'Restricted') {
        throw new Error(`${borrower.full_name} is Restricted due to unpaid overdue fines (>= $15.00).`);
      }

      const activeCount = (
        db
          .prepare('SELECT COUNT(*) AS count FROM loans WHERE borrower_id = ? AND returned_at IS NULL')
          .get(borrower.borrower_id) as { count: number }
      ).count;

      if (activeCount >= borrower.max_borrow_limit) {
        throw new Error(
          `${borrower.full_name} has reached the maximum borrow limit (${borrower.max_borrow_limit} items).`
        );
      }

      const item = db
        .prepare(`
          SELECT i.*, c.loan_period_days
          FROM inventory_items i
          JOIN categories c ON i.category_id = c.category_id
          WHERE i.item_id = ?
        `)
        .get(Number(item_id)) as
        | {
            item_id: number;
            title: string;
            available_copies: number;
            condition_status: string;
            loan_period_days: number;
          }
        | undefined;

      if (!item) {
        throw new Error('Selected inventory item does not exist.');
      }

      if (item.condition_status === 'Maintenance') {
        throw new Error(`"${item.title}" is currently under Maintenance and cannot be checked out.`);
      }

      if (item.available_copies <= 0) {
        throw new Error(`"${item.title}" has 0 available copies left for borrowing.`);
      }

      const borrowedAt = todayISO();
      const loanDays =
        custom_days && Number(custom_days) > 0 ? Math.min(60, Number(custom_days)) : item.loan_period_days;
      const dueDate = addDaysISO(borrowedAt, loanDays);

      const insertResult = db
        .prepare(`
          INSERT INTO loans (item_id, borrower_id, borrowed_at, due_date, returned_at, status, notes)
          VALUES (?, ?, ?, ?, NULL, 'Active', ?)
        `)
        .run(item.item_id, borrower.borrower_id, borrowedAt, dueDate, (notes || '').trim());

      db.prepare(`
        UPDATE inventory_items
        SET available_copies = available_copies - 1
        WHERE item_id = ?
      `).run(item.item_id);

      return insertResult.lastInsertRowid;
    });

    const newLoanId = checkoutTx();
    res.status(201).json({ loan_id: newLoanId, message: 'Loan issued successfully.' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Transactional Return + Fine Assessment
app.post('/api/loans/:id/return', (req, res) => {
  try {
    const loanId = Number(req.params.id);
    const today = todayISO();

    const returnTx = db.transaction(() => {
      const loan = db
        .prepare(`
          SELECT
            l.*,
            c.daily_fine_rate,
            CAST(julianday(?) - julianday(l.due_date) AS INTEGER) AS days_overdue
          FROM loans l
          JOIN inventory_items i ON l.item_id = i.item_id
          JOIN categories c ON i.category_id = c.category_id
          WHERE l.loan_id = ?
        `)
        .get(today, loanId) as
        | {
            loan_id: number;
            item_id: number;
            borrower_id: number;
            due_date: string;
            returned_at: string | null;
            daily_fine_rate: number;
            days_overdue: number;
          }
        | undefined;

      if (!loan) {
        throw new Error('Loan record not found.');
      }

      if (loan.returned_at !== null) {
        throw new Error('This loan has already been returned.');
      }

      db.prepare(`
        UPDATE loans
        SET returned_at = ?, status = 'Returned'
        WHERE loan_id = ?
      `).run(today, loanId);

      db.prepare(`
        UPDATE inventory_items
        SET available_copies = MIN(total_copies, available_copies + 1)
        WHERE item_id = ?
      `).run(loan.item_id);

      const daysLate = Math.max(0, loan.days_overdue);
      let fineAssessed = 0;

      if (daysLate > 0) {
        fineAssessed = Number((daysLate * loan.daily_fine_rate).toFixed(2));
        const existingFine = db
          .prepare('SELECT fine_id, amount_paid, payment_status FROM fines WHERE loan_id = ?')
          .get(loanId) as { fine_id: number; amount_paid: number; payment_status: string } | undefined;

        if (!existingFine) {
          db.prepare(`
            INSERT INTO fines (loan_id, borrower_id, days_overdue, daily_rate, amount_due, amount_paid, payment_status)
            VALUES (?, ?, ?, ?, ?, 0, 'Unpaid')
          `).run(loanId, loan.borrower_id, daysLate, loan.daily_fine_rate, fineAssessed);
        } else if (existingFine.payment_status !== 'Waived') {
          db.prepare(`
            UPDATE fines
            SET days_overdue = ?, daily_rate = ?, amount_due = ?,
                payment_status = CASE
                  WHEN amount_paid >= ? THEN 'Paid'
                  WHEN amount_paid > 0 THEN 'Partial'
                  ELSE 'Unpaid'
                END
            WHERE fine_id = ?
          `).run(daysLate, loan.daily_fine_rate, fineAssessed, fineAssessed, existingFine.fine_id);
        }
      }

      return { loan_id: loanId, days_overdue: daysLate, fine_assessed: fineAssessed };
    });

    const outcome = returnTx();
    syncOverdueAndFines();
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Fines Ledger (4-table JOIN)
app.get('/api/fines', (_req, res) => {
  try {
    syncOverdueAndFines();
    const fines = db
      .prepare(`
        SELECT
          f.*,
          b.university_id,
          b.full_name AS borrower_name,
          b.email AS borrower_email,
          i.item_id,
          i.asset_code,
          i.title AS item_title,
          l.status AS loan_status,
          l.due_date,
          l.returned_at
        FROM fines f
        JOIN loans l ON f.loan_id = l.loan_id
        JOIN borrowers b ON f.borrower_id = b.borrower_id
        JOIN inventory_items i ON l.item_id = i.item_id
        ORDER BY
          CASE f.payment_status WHEN 'Unpaid' THEN 0 WHEN 'Partial' THEN 1 WHEN 'Paid' THEN 2 ELSE 3 END,
          f.assessed_at DESC,
          f.fine_id DESC
      `)
      .all();
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/fines/sync', (_req, res) => {
  try {
    const result = syncOverdueAndFines();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/fines/:id/pay', (req, res) => {
  try {
    const fineId = Number(req.params.id);
    const { amount } = req.body as { amount?: number };

    const fine = db.prepare('SELECT * FROM fines WHERE fine_id = ?').get(fineId) as
      | {
          fine_id: number;
          amount_due: number;
          amount_paid: number;
          payment_status: string;
        }
      | undefined;

    if (!fine) {
      res.status(404).json({ error: 'Fine record not found.' });
      return;
    }

    if (fine.payment_status === 'Paid' || fine.payment_status === 'Waived') {
      res.status(400).json({ error: 'This fine is already settled or waived.' });
      return;
    }

    const remaining = Number((fine.amount_due - fine.amount_paid).toFixed(2));
    const paymentAmount = amount !== undefined ? Number(amount) : remaining;

    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than $0.00.' });
      return;
    }

    const nextPaid = Number(Math.min(fine.amount_due, fine.amount_paid + paymentAmount).toFixed(2));
    const nextStatus = nextPaid >= fine.amount_due ? 'Paid' : 'Partial';
    const settledAt = nextStatus === 'Paid' ? todayISO() : null;

    db.prepare(`
      UPDATE fines
      SET amount_paid = ?, payment_status = ?, settled_at = COALESCE(?, settled_at)
      WHERE fine_id = ?
    `).run(nextPaid, nextStatus, settledAt, fineId);

    syncOverdueAndFines();
    res.json({ fine_id: fineId, amount_paid: nextPaid, payment_status: nextStatus });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/fines/:id/waive', (req, res) => {
  try {
    const fineId = Number(req.params.id);
    const fine = db.prepare('SELECT fine_id FROM fines WHERE fine_id = ?').get(fineId);
    if (!fine) {
      res.status(404).json({ error: 'Fine record not found.' });
      return;
    }

    db.prepare(`
      UPDATE fines
      SET payment_status = 'Waived', settled_at = ?
      WHERE fine_id = ?
    `).run(todayISO(), fineId);

    syncOverdueAndFines();
    res.json({ fine_id: fineId, payment_status: 'Waived' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Relational Schema Introspection
app.get('/api/schema', (_req, res) => {
  try {
    const tables = db
      .prepare(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY
          CASE name
            WHEN 'categories' THEN 1
            WHEN 'inventory_items' THEN 2
            WHEN 'borrowers' THEN 3
            WHEN 'loans' THEN 4
            WHEN 'fines' THEN 5
            ELSE 6
          END
      `)
      .all() as Array<{ name: string; sql: string }>;

    const schemaInfo = tables.map((tbl) => {
      const columns = db.prepare(`PRAGMA table_info("${tbl.name}")`).all();
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${tbl.name}")`).all();
      const countRow = db.prepare(`SELECT COUNT(*) AS row_count FROM "${tbl.name}"`).get() as {
        row_count: number;
      };

      return {
        name: tbl.name,
        row_count: countRow.row_count,
        columns,
        foreign_keys: foreignKeys,
        create_sql: tbl.sql,
      };
    });

    res.json(schemaInfo);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Safe Read-Only SQL Inspector for Relational Table Demonstration
app.post('/api/sql-inspect', (req, res) => {
  try {
    const { query } = req.body as { query?: string };
    if (!query || !query.trim()) {
      res.status(400).json({ error: 'SQL query cannot be empty.' });
      return;
    }

    const trimmed = query.trim().replace(/;+\s*$/, '');
    if (trimmed.includes(';')) {
      res.status(400).json({ error: 'Only a single SELECT statement may be executed at a time.' });
      return;
    }

    const upper = trimmed.toUpperCase();
    if (!upper.startsWith('SELECT ') && !upper.startsWith('WITH ')) {
      res.status(400).json({ error: 'Only read-only SELECT or WITH queries are permitted in the SQL Inspector.' });
      return;
    }

    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i;
    if (forbidden.test(trimmed)) {
      res.status(400).json({ error: 'Mutating or DDL statements are blocked in the read-only SQL Inspector.' });
      return;
    }

    const start = performance.now();
    const stmt = db.prepare(trimmed);
    const rows = stmt.all() as Array<Record<string, unknown>>;
    const elapsedMs = Number((performance.now() - start).toFixed(2));
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({
      columns,
      rows: rows.slice(0, 100),
      total_rows: rows.length,
      elapsed_ms: elapsedMs,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(distPath)) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*path', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShelfLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
