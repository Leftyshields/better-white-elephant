# MCP Server Setup Guide for GitHub Issue Management

## Current Setup

You already have a GitHub MCP server configured at `~/.cursor/mcp.json`. However, the token needs additional permissions to close issues.

## Step 1: Update GitHub Personal Access Token Permissions

Your current token needs the `public_repo` scope (or `repo` for private repos) to close issues.

### Option A: Update Existing Token (Recommended)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Direct link: https://github.com/settings/tokens
2. Find the token already saved in your MCP config.
3. Click "Edit" or regenerate with these scopes:
   - ✅ **repo** (Full control of private repositories)
     - Includes: `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`
   - OR if you only need public repo access:
   - ✅ **public_repo** (Access public repositories)

### Option B: Create New Token

1. Go to: https://github.com/settings/tokens/new
2. Give it a descriptive name: "Cursor MCP GitHub Integration"
3. Select scopes:
   - ✅ **repo** (for full repository access including private repos)
   - OR
   - ✅ **public_repo** (if only working with public repos)
4. Set expiration (30 days, 90 days, or no expiration)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again!)

## Step 2: Update MCP Configuration

Edit your MCP config file:

```bash
nano ~/.cursor/mcp.json
```

Or use your preferred editor. Update the `GITHUB_PERSONAL_ACCESS_TOKEN` value with your new/updated token:

```json
{
  "mcpServers": {
    "gh": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_NEW_TOKEN_HERE"
      }
    }
  }
}
```

**Note**: Replace `YOUR_NEW_TOKEN_HERE` with your actual token. Use the `npx` on your machine if it is not on your default PATH.

## Step 3: Restart Cursor

After updating the token:
1. **Restart Cursor completely** (quit and reopen)
2. This ensures the MCP server picks up the new token

## Step 4: Verify Setup

After restarting, the MCP server should have permissions to:
- ✅ Read issues
- ✅ Update issues (including closing them)
- ✅ Add comments to issues
- ✅ Create/update pull requests
- ✅ And more...

## Alternative: Environment Variable Approach

If you prefer, you can also set the token as an environment variable:

1. Add to your shell profile (`~/.bashrc` or `~/.zshrc`):
   ```bash
   export GITHUB_PERSONAL_ACCESS_TOKEN="your_token_here"
   ```

2. Then reference it in `mcp.json`:
   ```json
   {
     "mcpServers": {
       "gh": {
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-github"
         ],
         "env": {
           "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
         }
       }
     }
   }
   ```

## Troubleshooting

### Permission Denied Error

If you still get "Permission Denied":
1. **Verify token scopes**: Make sure the token has `repo` or `public_repo` scope
2. **Check token expiration**: Ensure the token hasn't expired
3. **Restart Cursor**: After updating the token, completely quit and restart Cursor
4. **Check token owner**: Ensure the token belongs to an account that has access to the repository

### Test Token Permissions

You can test read access with curl (replace `YOUR_TOKEN`):

```bash
curl -H "Authorization: token YOUR_TOKEN" \
     https://api.github.com/repos/Leftyshields/better-white-elephant/issues/1
```

If this returns issue JSON, your token can read issues. To test write access without changing real issues, post a comment on a throwaway test issue in a fork or sandbox repo.

## Security Best Practices

1. **Never commit tokens**: The `.gitignore` already excludes `mcp.json` from git
2. **Use minimal scopes**: Only grant the permissions you need
3. **Set expiration**: Consider setting a reasonable expiration date
4. **Rotate tokens**: Regularly rotate tokens for security
5. **Store securely**: Treat tokens like passwords

## Next Steps

After this is set up, Cursor can read and update issues and pull requests in this repo.
