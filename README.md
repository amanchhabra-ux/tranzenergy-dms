# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Environment variables for sign-in

| Variable | Needed | What it does |
|---|---|---|
| `SESSION_SECRET` | Recommended | Signs the sign-in cookies. When unset, the storage key (`BLOB_READ_WRITE_TOKEN` or `R2_SECRET_ACCESS_KEY`) is used instead, a warning is logged and the Admin panel shows a banner. Setting it, or changing it, signs everyone out once. Use a long random value. |
| `ADMIN_EMAILS` | Optional | Comma-separated emails treated as admins. On a brand-new deployment (no admin and no user has a password yet) and without `ADMIN_BOOTSTRAP_TOKEN`, one of these emails can sign in once with any password and must then choose a real one. |
| `ADMIN_BOOTSTRAP_TOKEN` | Optional | While no admin has a password, an admin (by role or in `ADMIN_EMAILS`) signs in once with this token as the password and must then choose a real one. Remove it once the first admin has a password. |

Once any admin has a password, neither bootstrap route applies: sign-in is by password only, and admins set everyone else's password in the Admin panel. There is no built-in password.

Local development (`npm run dev`) keeps its data in `.local-data`. On an empty `.local-data`, start it with `ADMIN_EMAILS=aman@tranzenergy.in npm run dev` (or with `ADMIN_BOOTSTRAP_TOKEN`) to set the first password.
