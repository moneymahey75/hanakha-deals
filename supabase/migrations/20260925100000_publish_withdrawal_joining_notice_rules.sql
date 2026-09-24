-- The public Plans page displays the current joining requirements before purchase.
-- Expose only this non-sensitive setting; eligibility RPC remains self-only.
DROP POLICY IF EXISTS withdrawal_joining_rules_read ON public.tbl_system_settings;
CREATE POLICY withdrawal_joining_rules_read ON public.tbl_system_settings
FOR SELECT TO anon, authenticated USING (tss_setting_key = 'withdrawal_joining_rules');
NOTIFY pgrst, 'reload schema';
