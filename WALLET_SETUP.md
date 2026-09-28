# Growbot Wallet Upgrade

## What is included
- Coins wallet next to the existing Points balance.
- Channel/group task: +50 Coins.
- Bot task: +80 Coins.
- Exchange: 1,000 Coins = 0.0100 USDT.
- One AdsGram Reward ad (block `50410`) is required for every Coins -> USDT exchange.
- Withdrawal unlock: 7 AdsGram Reward ads (block `50410`).
- Payout method: Gram address only.
- Withdrawal requests are stored in `withdrawal_requests` and managed from the Admin Panel.
- Weekly task leaderboard resets automatically every Friday in Asia/Baghdad time by starting a new weekly bucket; old weeks are preserved.

## Database
Run the existing Growbot SQL migrations first, then run:
`supabase_wallet_withdrawal_leaderboard.sql`

## AdsGram
The wallet uses Reward block ID `50410`. The existing client-side AdsGram completion flow is used for the wallet transactions. The server also supports the Reward URL webhook with `kind=wallet` when your AdsGram block is configured to include that query parameter.

The existing Reward URL endpoint remains:
`/api/auth/me?adsgram_reward=1&secret=YOUR_SECRET&userid=[userId]`

For wallet-aware postbacks, append:
`&kind=wallet`

## Admin Panel
Open the existing Admin Panel and use the new `السحوبات` section. Pending requests can be approved or rejected; a rejected request automatically returns its USDT balance to the user.
