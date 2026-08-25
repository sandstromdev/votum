# PostgreSQL serialization investigation

The verified reproduction used PostgreSQL 18.6. Concurrent inserts into `participant_token_anomaly`
produced SQLSTATE `40001` (`serialization_failure`) while participant page projections used
repeatable-read transactions.

That evidence is limited to the diagnostic insert race. A failed savepoint cannot make the surrounding
repeatable-read transaction safe to continue, so the projection commits first and the non-essential
diagnostic write runs afterward in its own short best-effort transaction.
