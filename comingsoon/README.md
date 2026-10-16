# TenTrust Coming Soon

A standalone, responsive waitlist landing page. It uses plain HTML, CSS, and JavaScript; there is no build step. The Tentrust Node server and Netlify function accept submissions at `POST /api/waitlist` and insert them into the Supabase `public.waitlist` table.

## Customize before launch

- **Name and copy:** edit `index.html`. Search for `TenTrust`, `soon`, and `example` to find the wordmark, FAQ, launch copy, email, social links, and sample profile. The profile names and details are fictional placeholders.
- **Colors:** edit the CSS custom properties at the top of `styles.css` (`--ink`, `--green`, `--coral`, `--paper`, and related tokens).
- **Waitlist storage:** submissions include the person's name, email, role, timestamp, and available UTM parameters. Apply `supabase/migrations/202610160001_waitlist.sql` to create the table and its insert-only access policy. Duplicate email addresses are rejected. Configure the public Supabase URL and anon key for the Node server (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or `SUPABASE_URL` and `SUPABASE_ANON_KEY`) and for the Netlify function. The service-role key is not needed.
- **Launch and sharing details:** replace the launch wording and `example.com` values in the Open Graph metadata in `index.html`; add a real share image and favicon if you have them.
- **Privacy:** publish a privacy policy and update the privacy note/link before collecting real emails. The current note is placeholder copy.

## Deploy

Upload the `comingsoon` folder as the static site root to Netlify, Vercel, GitHub Pages, or any static host. `index.html`, `styles.css`, `logo.css`, `script.js`, `favicon.svg`, and `tentrust-logo.png` are all served directly. No install or build command is needed.

The optional Google Fonts request falls back to system sans-serif fonts if it is unavailable. Form submissions remain disabled with a friendly message until `FORM_ENDPOINT` is configured.
