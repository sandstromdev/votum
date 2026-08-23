-- Not a Drizzle migration. Copy back into a migration if generate drops these.
CREATE OR REPLACE FUNCTION outcome_snapshot_immutable() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'outcome snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outcome_snapshot_no_update ON outcome_snapshot;
CREATE TRIGGER outcome_snapshot_no_update
	BEFORE UPDATE ON outcome_snapshot
	FOR EACH ROW
	EXECUTE PROCEDURE outcome_snapshot_immutable();

DROP TRIGGER IF EXISTS outcome_snapshot_no_delete ON outcome_snapshot;
CREATE TRIGGER outcome_snapshot_no_delete
	BEFORE DELETE ON outcome_snapshot
	FOR EACH ROW
	EXECUTE PROCEDURE outcome_snapshot_immutable();
