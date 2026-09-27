# Flex Card Admin

Flex Card 推薦分潤後台。

- Supabase project: `flex-card`
- Mobile-first admin dashboard
- Direct referral attribution only
- Members / referrals / conversions / commissions
- Supabase Auth + RLS protected

## Deployment

Static site. Deploy `main` branch with GitHub Pages or another static host.

## Security

Only the Supabase publishable key is used in the browser. Sensitive data access is protected by RLS. Do not place Supabase secret/service-role keys in this repository.


## 2026-09-27 Interaction / Referral History

- Any tracked business-card button creates or refreshes a member interaction.
- Member interactions are deduplicated by member + action; the admin shows the latest interaction time.
- Referral source evidence is append-only in `referral_history`.
- The current formal referrer remains in `referral_relationships`.
- A later normal button click from another source does not overwrite the formal referrer.
- A later in-card `share` action from another source may reassign the formal referrer while preserving the full history.
