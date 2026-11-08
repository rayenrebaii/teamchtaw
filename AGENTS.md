<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The website is a public showcase with no account routes; mobile account approval remains in `profiles.approved` with admin-only updates, and protected `app_config` access must remain unchanged because the mobile application owns that flow.
- Public website contact and platform-specific download destinations are configured in `src/lib/site.ts`, separate from the mobile application's protected configuration, so showcase visitors need no session.
