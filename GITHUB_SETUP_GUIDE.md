# Step-by-Step GitHub Repository Setup Guide

Follow this simple, foolproof guide to create your new GitHub repository and push your **MCP File-Server Connector** code to it.

---

## Step 1: Create a New Empty Repository on GitHub.com

1. Open your web browser and go to [https://github.com/new](https://github.com/new) (make sure you are logged in to GitHub).
2. Fill in the repository details:
   - **Repository name:** `mcp-fileserver` *(or any name you prefer, e.g. `mcp-fileserver-connector`)*
   - **Description (optional):** `Sandboxed MCP File-Server Connector with Multi-Agent Handoff Protocol, Concurrency Locks, and Streamable HTTP`
   - **Visibility:** Choose **Public** or **Private** (according to your school/class submission requirements).
3. **IMPORTANT**: **Do NOT check** any of the initialize boxes:
   - ❌ *Do NOT add a README file* (we already have a complete, professional README)
   - ❌ *Do NOT add .gitignore* (we already have a customized .gitignore)
   - ❌ *Do NOT choose a license* (we already include license metadata)
4. Click the green **"Create repository"** button.

---

## Step 2: Initialize Git and Commit Your Project Locally

Open your terminal (PowerShell or Command Prompt) and navigate to the project directory:

```bash
cd C:\Users\Acer\projects\mcp-fileserver
```

Run the following commands to initialize git and make your first commit:

```bash
# 1. Initialize local git repository
git init

# 2. Stage all project files (ignoring node_modules, .env, and logs automatically)
git add .

# 3. Create your initial commit with a clear, professional message
git commit -m "feat: initial release of sandboxed mcp file-server with handoff protocol and tests"

# 4. Ensure your default branch is named 'main'
git branch -M main
```

---

## Step 3: Link and Push to Your GitHub Repository

On your newly created GitHub page, copy the repository URL (it will look like `https://github.com/<YOUR-USERNAME>/mcp-fileserver.git`).

Then run:

```bash
# Replace <YOUR-USERNAME> with your actual GitHub username
git remote add origin https://github.com/<YOUR-USERNAME>/mcp-fileserver.git

# Push your code to GitHub
git push -u origin main
```

> **Note on Authentication:** If prompted for GitHub credentials:
> - If using HTTPS, enter your GitHub username and a **Personal Access Token (PAT)** as your password (or use GitHub Desktop / Web login if configured).
> - If you use SSH keys, use `git remote add origin git@github.com:<YOUR-USERNAME>/mcp-fileserver.git`.

---

## Step 4: Verify Your Repository

1. Refresh your GitHub repository page.
2. You will see:
   - Full directory layout (`src/`, `tests/`, `workspace/`, `ecosystem.config.cjs`)
   - The formatted [README.md](./README.md) rendered right on the repository home page
   - Clean, untracked `.env` (protecting your secrets from ever leaking into public history)
3. Share the repository link as your midterm deliverable!
