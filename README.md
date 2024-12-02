Post directly from Roam Research to Bluesky! This Roam Depot extension allows you to share your thoughts, notes, and threads from Roam to your Bluesky account with just a few clicks.

## Features

- 🚀 Post single blocks or entire thread structures
- 🖼️ Supports image uploads (including Dropbox images)
- #️⃣ Automatically converts Roam page references to hashtags
- 📝 Resolves block references in posts
- 📅 Optional date stamping of posted content
- ⌨️ Command palette integration with default hotkey (Ctrl+Shift+P)

## Configuration

### Bluesky Account Setup
1. Go to Settings > Bluesky Post
2. Enter your Bluesky username and password
3. Click the "+" button to save your credentials

### Date Append Settings (Optional)
- Enable/disable automatic date appending to posted blocks
- Customize the date append template (default: "sent on {DATE}")

## Usage

1. Select any block in your Roam graph
2. Either:
   - Use the command palette (Ctrl+P) and search for "🦋 Post to Bluesky"
   - Use the hotkey Ctrl+Shift+P
3. The block and its children (if any) will be posted as a thread to Bluesky

### Formatting Support
- `[[Page References]]` are converted to #hashtags
- `((Block References))` are resolved to their content
- Images with `![alt](url)` syntax are uploaded

## Notes

- Character limit per post: 300 characters
- Supports nested thread creation from block hierarchies
- Images from Dropbox links are automatically handled
