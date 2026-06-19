/**
 * Golden eval dataset. Each case is a document plus the epic titles a correct
 * extraction should surface (matched fuzzily, so exact wording isn't required).
 * Keep this small — every case costs one extraction run.
 */
export interface EvalCase {
  name: string;
  documentText: string;
  expectedEpics: string[];
}

export const EVAL_CASES: EvalCase[] = [
  {
    name: 'ecommerce',
    documentText: `Acme Online Store Requirements.
Customers browse products by category and search by keyword. They add items to a
cart and check out with a credit card. Customers who forget their password can
reset it via a time-limited email link. Administrators manage inventory and view
daily sales totals. After a purchase, the system emails an order confirmation.`,
    expectedEpics: ['Product Discovery', 'Shopping Cart Checkout', 'Password Recovery', 'Admin Dashboard', 'Order Confirmation'],
  },
  {
    name: 'banking',
    documentText: `Mobile Banking App.
Users log in with biometrics and view account balances and transaction history.
They transfer money between accounts and pay bills. The app sends push
notifications for large transactions. Users can deposit cheques by photo.`,
    expectedEpics: ['Authentication', 'Account Overview', 'Money Transfer', 'Bill Payment', 'Transaction Notifications', 'Cheque Deposit'],
  },
];
