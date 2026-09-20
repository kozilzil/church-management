INSERT INTO permission (code) VALUES ('finance.report'), ('finance.export') ON CONFLICT DO NOTHING;
CREATE INDEX journal_line_church_id_journal_id_idx ON journal_line(church_id, journal_id);
CREATE INDEX journal_line_church_id_account_id_fund_id_idx ON journal_line(church_id, account_id, fund_id);
