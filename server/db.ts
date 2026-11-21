import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

// Enforce relational integrity on every connection
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL CHECK (domain IN ('Library', 'Lab')),
      loan_period_days INTEGER NOT NULL CHECK (loan_period_days > 0),
      daily_fine_rate REAL NOT NULL CHECK (daily_fine_rate >= 0)
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      domain TEXT NOT NULL CHECK (domain IN ('Library', 'Lab')),
      category_id INTEGER NOT NULL,
      location_shelf TEXT NOT NULL,
      total_copies INTEGER NOT NULL CHECK (total_copies >= 0),
      available_copies INTEGER NOT NULL CHECK (available_copies >= 0 AND available_copies <= total_copies),
      unit_value REAL NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
      condition_status TEXT NOT NULL DEFAULT 'Excellent' CHECK (condition_status IN ('Excellent', 'Good', 'Maintenance')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS borrowers (
      borrower_id INTEGER PRIMARY KEY AUTOINCREMENT,
      university_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      year_of_study TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Student', 'TA', 'Faculty')),
      max_borrow_limit INTEGER NOT NULL DEFAULT 4 CHECK (max_borrow_limit > 0),
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Restricted'))
    );

    CREATE TABLE IF NOT EXISTS loans (
      loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      borrower_id INTEGER NOT NULL,
      borrowed_at TEXT NOT NULL,
      due_date TEXT NOT NULL,
      returned_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('Active', 'Overdue', 'Returned')),
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (item_id) REFERENCES inventory_items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(borrower_id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS fines (
      fine_id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL UNIQUE,
      borrower_id INTEGER NOT NULL,
      days_overdue INTEGER NOT NULL CHECK (days_overdue > 0),
      daily_rate REAL NOT NULL CHECK (daily_rate >= 0),
      amount_due REAL NOT NULL CHECK (amount_due >= 0),
      amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      payment_status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Partial', 'Paid', 'Waived')),
      assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT,
      FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (borrower_id) REFERENCES borrowers(borrower_id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_items_category ON inventory_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_loans_item ON loans(item_id);
    CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
    CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
    CREATE INDEX IF NOT EXISTS idx_fines_borrower ON fines(borrower_id);
  `);

  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (categoryCount.count === 0) {
    seedInitialData();
  }

  syncOverdueAndFines();
}

function daysOffsetISO(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function seedInitialData(): void {
  const seedTx = db.transaction(() => {
    const insertCategory = db.prepare(`
      INSERT INTO categories (name, domain, loan_period_days, daily_fine_rate)
      VALUES (?, ?, ?, ?)
    `);

    const categories: Array<[string, string, number, number]> = [
      ['CS & Systems Textbooks', 'Library', 14, 0.50],
      ['Reference & IEEE Monographs', 'Library', 7, 1.00],
      ['Embedded & MCU Kits', 'Lab', 7, 2.00],
      ['Benchtop Oscilloscopes', 'Lab', 3, 5.00],
      ['Optics & Sensor Modules', 'Lab', 5, 3.00],
      ['Robotics & Actuator Packs', 'Lab', 10, 2.50],
    ];

    for (const cat of categories) {
      insertCategory.run(...cat);
    }

    const insertItem = db.prepare(`
      INSERT INTO inventory_items (
        asset_code, title, domain, category_id, location_shelf,
        total_copies, available_copies, unit_value, condition_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const items: Array<[string, string, string, number, string, number, number, number, string]> = [
      ['LIB-CS-101', 'Database System Concepts (7th Ed.)', 'Library', 1, 'Stack A · Shelf 04', 6, 6, 115.0, 'Excellent'],
      ['LIB-CS-104', 'Introduction to Algorithms (CLRS 4th Ed.)', 'Library', 1, 'Stack A · Shelf 06', 5, 5, 130.0, 'Excellent'],
      ['LIB-CS-112', 'Operating System Concepts', 'Library', 1, 'Stack A · Shelf 08', 4, 4, 98.0, 'Good'],
      ['LIB-REF-202', 'Computer Architecture: A Quantitative Approach', 'Library', 2, 'Ref Bay B · Shelf 02', 3, 3, 105.0, 'Excellent'],
      ['LIB-REF-209', 'Digital Signal Processing Principles', 'Library', 2, 'Ref Bay B · Shelf 05', 2, 2, 140.0, 'Good'],
      ['LAB-MCU-301', 'STM32 Nucleo-F446RE Dev Kit', 'Lab', 3, 'Lab C · Cabinet 01', 8, 8, 42.0, 'Excellent'],
      ['LAB-MCU-305', 'Raspberry Pi 5 (8GB) + PSU Bundle', 'Lab', 3, 'Lab C · Cabinet 02', 6, 6, 95.0, 'Excellent'],
      ['LAB-MCU-312', 'FPGA Basys 3 Artix-7 Trainer Board', 'Lab', 3, 'Lab C · Cabinet 04', 4, 4, 165.0, 'Good'],
      ['LAB-OSC-401', 'Rigol DS1054Z 4-Ch Digital Oscilloscope', 'Lab', 4, 'Bench Locker D-01', 3, 3, 399.0, 'Excellent'],
      ['LAB-OSC-404', 'Saleae Logic Pro 8 Analyzer', 'Lab', 4, 'Bench Locker D-03', 4, 4, 499.0, 'Excellent'],
      ['LAB-OPT-502', 'Laser Interferometer Alignment Kit', 'Lab', 5, 'Optics Vault E-02', 2, 2, 620.0, 'Good'],
      ['LAB-ROB-601', '6-DOF Servo Arm & Stepper Controller Kit', 'Lab', 6, 'Robotics Bay F-01', 5, 5, 280.0, 'Excellent'],
    ];

    for (const item of items) {
      insertItem.run(...item);
    }

    const insertBorrower = db.prepare(`
      INSERT INTO borrowers (
        university_id, full_name, email, department, year_of_study, role, max_borrow_limit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const borrowers: Array<[string, string, string, string, string, string, number, string]> = [
      ['STU-2025-0142', 'Aarav Kulkarni', 'aarav.k@campus.edu', 'Computer Science', '2nd Year', 'Student', 4, 'Active'],
      ['STU-2025-0189', 'Maya Lin', 'maya.lin@campus.edu', 'Electrical & ECE', '2nd Year', 'Student', 4, 'Active'],
      ['STU-2025-0211', 'Rohan Deshmukh', 'rohan.d@campus.edu', 'Computer Science', '2nd Year', 'Student', 4, 'Active'],
      ['STU-2024-0094', 'Elena Novak', 'elena.n@campus.edu', 'Robotics & Mechatronics', '3rd Year', 'Student', 5, 'Active'],
      ['STU-2025-0305', 'Samuel Okafor', 's.okafor@campus.edu', 'Physics', '2nd Year', 'Student', 4, 'Active'],
      ['TA-2023-0018', 'Priya Nair', 'priya.nair@campus.edu', 'Computer Science', 'Grad TA', 'TA', 6, 'Active'],
      ['FAC-2019-0007', 'Dr. Henrik Lindqvist', 'h.lindqvist@campus.edu', 'Electrical & ECE', 'Faculty', 'Faculty', 10, 'Active'],
      ['STU-2025-0267', 'Chloe Morales', 'chloe.m@campus.edu', 'Mechanical Eng.', '2nd Year', 'Student', 4, 'Active'],
    ];

    for (const b of borrowers) {
      insertBorrower.run(...b);
    }

    const insertLoan = db.prepare(`
      INSERT INTO loans (item_id, borrower_id, borrowed_at, due_date, returned_at, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Overdue textbook (due 5 days ago)
    insertLoan.run(1, 1, daysOffsetISO(-19), daysOffsetISO(-5), null, 'Active', 'DBMS Lab Assignment 3');
    // 2. Overdue oscilloscope (due 4 days ago, high daily rate)
    insertLoan.run(9, 2, daysOffsetISO(-7), daysOffsetISO(-4), null, 'Active', 'ECE-204 Filter Characterization');
    // 3. Overdue FPGA board (due 2 days ago)
    insertLoan.run(8, 3, daysOffsetISO(-9), daysOffsetISO(-2), null, 'Active', 'Digital Logic Mini Project');
    // 4. Active loan due in 4 days
    insertLoan.run(2, 1, daysOffsetISO(-10), daysOffsetISO(4), null, 'Active', 'Algorithm Analysis Prep');
    // 5. Active loan due in 2 days
    insertLoan.run(6, 4, daysOffsetISO(-5), daysOffsetISO(2), null, 'Active', 'PID Motor Control Rig');
    // 6. Active loan due in 6 days
    insertLoan.run(12, 4, daysOffsetISO(-4), daysOffsetISO(6), null, 'Active', 'Inverse Kinematics Demo');
    // 7. Active loan due tomorrow
    insertLoan.run(10, 6, daysOffsetISO(-2), daysOffsetISO(1), null, 'Active', 'SPI Bus Debugging Lab');
    // 8. Active loan due in 5 days
    insertLoan.run(11, 5, daysOffsetISO(0), daysOffsetISO(5), null, 'Active', 'Michelson Fringe Experiment');
    // 9. Returned late (already has fine record)
    const lateLoanInfo = insertLoan.run(7, 8, daysOffsetISO(-18), daysOffsetISO(-11), daysOffsetISO(-8), 'Returned', 'IoT Sensor Node Prototype');
    // 10. Returned on time
    insertLoan.run(4, 7, daysOffsetISO(-12), daysOffsetISO(-5), daysOffsetISO(-6), 'Returned', 'Seminar Reading');

    // Insert settled/partial fine for loan 9 (3 days overdue * $2.00 = $6.00)
    db.prepare(`
      INSERT INTO fines (loan_id, borrower_id, days_overdue, daily_rate, amount_due, amount_paid, payment_status, assessed_at, settled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lateLoanInfo.lastInsertRowid, 8, 3, 2.0, 6.0, 6.0, 'Paid', daysOffsetISO(-8), daysOffsetISO(-7));

    // Synchronize available_copies strictly from open loans
    db.exec(`
      UPDATE inventory_items
      SET available_copies = total_copies - (
        SELECT COUNT(*) FROM loans
        WHERE loans.item_id = inventory_items.item_id
          AND loans.returned_at IS NULL
      )
    `);
  });

  seedTx();
}

export function syncOverdueAndFines(): { updatedLoans: number; syncedFines: number } {
  const today = new Date().toISOString().slice(0, 10);

  const syncTx = db.transaction(() => {
    const overdueResult = db.prepare(`
      UPDATE loans
      SET status = 'Overdue'
      WHERE returned_at IS NULL AND due_date < ? AND status != 'Overdue'
    `).run(today);

    const openOverdueLoans = db.prepare(`
      SELECT
        l.loan_id,
        l.borrower_id,
        l.due_date,
        c.daily_fine_rate,
        CAST(julianday(?) - julianday(l.due_date) AS INTEGER) AS days_overdue
      FROM loans l
      JOIN inventory_items i ON l.item_id = i.item_id
      JOIN categories c ON i.category_id = c.category_id
      WHERE l.returned_at IS NULL AND l.due_date < ?
    `).all(today, today) as Array<{
      loan_id: number;
      borrower_id: number;
      due_date: string;
      daily_fine_rate: number;
      days_overdue: number;
    }>;

    const existingFineStmt = db.prepare('SELECT fine_id, amount_paid, payment_status FROM fines WHERE loan_id = ?');
    const insertFineStmt = db.prepare(`
      INSERT INTO fines (loan_id, borrower_id, days_overdue, daily_rate, amount_due, amount_paid, payment_status)
      VALUES (?, ?, ?, ?, ?, 0, 'Unpaid')
    `);
    const updateFineStmt = db.prepare(`
      UPDATE fines
      SET days_overdue = ?, daily_rate = ?, amount_due = ?,
          payment_status = CASE
            WHEN payment_status = 'Waived' THEN 'Waived'
            WHEN amount_paid >= ? THEN 'Paid'
            WHEN amount_paid > 0 THEN 'Partial'
            ELSE 'Unpaid'
          END
      WHERE fine_id = ?
    `);

    let syncedFines = 0;
    for (const loan of openOverdueLoans) {
      const daysOverdue = Math.max(1, loan.days_overdue);
      const amountDue = Number((daysOverdue * loan.daily_fine_rate).toFixed(2));
      const existing = existingFineStmt.get(loan.loan_id) as
        | { fine_id: number; amount_paid: number; payment_status: string }
        | undefined;

      if (!existing) {
        insertFineStmt.run(loan.loan_id, loan.borrower_id, daysOverdue, loan.daily_fine_rate, amountDue);
        syncedFines += 1;
      } else if (existing.payment_status !== 'Waived') {
        updateFineStmt.run(daysOverdue, loan.daily_fine_rate, amountDue, amountDue, existing.fine_id);
        syncedFines += 1;
      }
    }

    // Update borrower restriction status if unpaid fines exceed $15.00
    db.exec(`
      UPDATE borrowers
      SET status = CASE
        WHEN COALESCE((
          SELECT SUM(amount_due - amount_paid)
          FROM fines
          WHERE fines.borrower_id = borrowers.borrower_id
            AND fines.payment_status IN ('Unpaid', 'Partial')
        ), 0) >= 15.0 THEN 'Restricted'
        ELSE 'Active'
      END
    `);

    return { updatedLoans: overdueResult.changes, syncedFines };
  });

  return syncTx();
}

export default db;
