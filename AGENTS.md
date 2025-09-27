# Project Development Rules (AGENTS.md)

This document outlines the development rules, conventions, and best practices for this project to ensure consistency, quality, and collaboration.

## 1. Tech Stack

- **Frontend:** [Astro](https://astro.build/)
- **Backend API:** [Hono](https://hono.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) with the [DaisyUI](https://daisyui.com/) component library.
- **Package Manager:** [Bun](https://bun.sh/)

## 2. Development Rules

### Code Style & Conventions

- **Consistency is Key:** Before writing new code, always look at existing files in the project to understand and follow the established coding style, naming conventions, and architectural patterns.
- **UI Components:** This project uses [DaisyUI](https://daisyui.com/). Always prioritize using existing DaisyUI components (`btn`, `card`, `badge`, etc.) for new UI elements to maintain visual consistency.
- **Custom Styling:** All custom theming is defined in `src/assets/app..css`. Do not add one-off CSS styles directly to components. Instead, leverage the existing theme colors (`primary`, `secondary`, `base-100`, etc.) and utility classes from Tailwind CSS.
- **Formatting:** All code should be formatted automatically. It is recommended to use a tool like Prettier integrated into your code editor to ensure consistent formatting on save.
- **Naming:**
    - Use `camelCase` for variables and functions (e.g., `let nodeData;`).
    - Use `PascalCase` for type definitions and interfaces (e.g., `interface Node { ... }`).
- **Typing:** Use TypeScript for all new code. Define clear interfaces for API data structures and component props.

### Environment Variables

- All environment-specific variables (like API keys or base URLs) must be stored in a `.env` file in the project root.
- To expose a variable to the client-side (browser), its name **must** be prefixed with `PUBLIC_` (e.g., `PUBLIC_API_BASE_URL`).
- The `.env` file should **never** be committed to Git. A `.env.example` file should be created to list the required variables for other developers.

### Dependencies

- To add or update a dependency, use the Bun package manager: `bun install <package-name>` or `bun update`.
- Before adding a new dependency, consider if the functionality can be achieved with the existing tech stack. Discuss with the team if the new dependency adds significant value.

### API Development

- The backend API is built with Hono.
- All API changes should be documented. If using OpenAPI, ensure the specifications are updated.
- Strive for backward compatibility. If a breaking change is necessary, it must be communicated clearly.

### Commit Messages

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This helps in automating changelogs and makes the project history easier to understand.

The basic format is:

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

- **Common types:**
    - `feat`: A new feature.
    - `fix`: A bug fix.
    - `docs`: Documentation only changes.
    - `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc).
    - `refactor`: A code change that neither fixes a bug nor adds a feature.
    - `perf`: A code change that improves performance.
    - `chore`: Changes to the build process or auxiliary tools.

- **Example:**
  ```
  feat: Add real-time status updates via SSE
  
  Integrates a Server-Sent Events client to connect to the
  /api/nodes/status/events endpoint. The UI now updates automatically
  when node information changes on the backend.
  ```

## 3. Project Structure Overview

- `src/pages/`: Contains all pages and API routes for the Astro application.
- `src/layouts/`: Contains layout components that define the structure of pages.
- `src/assets/`: Contains static assets like CSS files.
- `public/`: For static assets that do not need to be processed by Astro's build system (e.g., `favicon.svg`).
- `.env`: Stores environment variables. **Do not commit this file.**
- `astro.config.mjs`: Astro project configuration.
