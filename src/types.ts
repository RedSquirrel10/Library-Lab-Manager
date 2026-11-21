export type DomainType = 'Library' | 'Lab';
export type ConditionStatus = 'Excellent' | 'Good' | 'Maintenance';
export type BorrowerRole = 'Student' | 'TA' | 'Faculty';
export type BorrowerStatus = 'Active' | 'Restricted';
export type LoanStatus = 'Active' | 'Overdue' | 'Returned';
export type FinePaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Waived';

export interface Category {
  category_id: number;
  name: string;
  domain: DomainType;
  loan_period_days: number;
  daily_fine_rate: number;
}

export interface InventoryItem {
  item_id: number;
  asset_code: string;
  title: string;
  domain: DomainType;
  category_id: number;
  category_name: string;
  loan_period_days: number;
  daily_fine_rate: number;
  location_shelf: string;
  total_copies: number;
  available_copies: number;
  unit_value: number;
  condition_status: ConditionStatus;
  created_at: string;
}

export interface Borrower {
  borrower_id: number;
  university_id: string;
  full_name: string;
  email: string;
  department: string;
  year_of_study: string;
  role: BorrowerRole;
  max_borrow_limit: number;
  status: BorrowerStatus;
  active_loans_count: number;
  unpaid_fines_total: number;
}

export interface LoanRecord {
  loan_id: number;
  item_id: number;
  asset_code: string;
  item_title: string;
  domain: DomainType;
  category_name: string;
  daily_fine_rate: number;
  borrower_id: number;
  university_id: string;
  borrower_name: string;
  department: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  status: LoanStatus;
  days_overdue: number;
  accrued_fine: number;
  notes: string;
}

export interface FineRecord {
  fine_id: number;
  loan_id: number;
  borrower_id: number;
  university_id: string;
  borrower_name: string;
  borrower_email: string;
  item_id: number;
  asset_code: string;
  item_title: string;
  loan_status: LoanStatus;
  due_date: string;
  returned_at: string | null;
  days_overdue: number;
  daily_rate: number;
  amount_due: number;
  amount_paid: number;
  payment_status: FinePaymentStatus;
  assessed_at: string;
  settled_at: string | null;
}

export interface DashboardSummary {
  total_titles: number;
  total_units: number;
  available_units: number;
  active_loans: number;
  overdue_loans: number;
  unpaid_fines_total: number;
  collected_fines_total: number;
  total_borrowers: number;
  domain_breakdown: Array<{
    domain: DomainType;
    titles: number;
    total_units: number;
    available_units: number;
    active_loans: number;
  }>;
  category_utilization: Array<{
    category_id: number;
    name: string;
    domain: DomainType;
    total_units: number;
    checked_out_units: number;
    utilization_pct: number;
    daily_fine_rate: number;
  }>;
}

export interface TableSchemaColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface TableForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

export interface TableSchemaInfo {
  name: string;
  row_count: number;
  columns: TableSchemaColumn[];
  foreign_keys: TableForeignKey[];
  create_sql: string;
}
