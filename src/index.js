import pkg from '../package.json';
import { AtpAgent, BlobRef } from '@atproto/api'
import { AppBskyFeedPost } from '@atproto/api'
import { showToast } from './components/toast';
import BlueskyLoginPanel from './components/BlueskyLoginPanel';

function getLoginInfo(extensionAPI) {
  return extensionAPI.settings.get('loginInfo') || null
}

async function postThread(posts, extensionAPI) {
  const loginInfo = getLoginInfo(extensionAPI)
  if (loginInfo == null) {
    showToast("Error: No Bluesky login saved", "DANGER");
  } else {

    // Initialize the ATP agent
    const agent = new AtpAgent({
      service: 'https://bsky.social'
    })


    // Login to Bluesky
    await agent.login({
      identifier: loginInfo.username,
      password: loginInfo.password
    })

    // Create the root post first
    const rootPost = await agent.api.app.bsky.feed.post.create(
      { repo: agent.session?.did },
      {
        text: posts[0],
        createdAt: new Date().toISOString(),
      }
    )

    // If there's only one post, we're done
    if (posts.length === 1) return rootPost

    // For multiple posts, we'll create a thread
    let parentPost = rootPost
    for (let i = 1; i < posts.length; i++) {
      // Create each reply in the thread
      parentPost = await agent.api.app.bsky.feed.post.create(
        { repo: agent.session?.did },
        {
          text: posts[i],
          reply: {
            root: {
              uri: rootPost.uri,
              cid: rootPost.cid
            },
            parent: {
              uri: parentPost.uri,
              cid: parentPost.cid
            }
          },
          createdAt: new Date().toISOString(),
        }
      )
    }
    showToast(`Blocks posted to Bluesky: ${login.username}`, "SUCCESS");

  }
  return rootPost
}

function extractBlocks(uid) {
  // Pull pattern to get block string, children and their order
  const pattern = `[
    :block/string 
    {:block/children [:block/string :block/order]}
  ]`;

  // Pull the data for the specified block
  const result = window.roamAlphaAPI.data.pull(
    pattern,
    [":block/uid", uid]
  );

  // Initialize array with the main block's string
  const orderedStrings = [result[":block/string"]];

  // If children exist, sort them by order and add their strings
  if (result && result[":block/children"]?.length > 0) {
    const sortedChildren = result[":block/children"]
      .sort((a, b) => a[":block/order"] - b[":block/order"])
      .map(child => child[":block/string"]);

    orderedStrings.push(...sortedChildren);
  }

  return orderedStrings;
}

async function onload({ extensionAPI }) {
  const panelConfig = {
    tabTitle: pkg.name,
    settings: [
      {
        id: "graphTokens",
        name: "Bluesky Login",
        action: {
          type: "reactComponent",
          component: BlueskyLoginPanel(extensionAPI)
        }
      },
      {
        id: "button-setting",
        name: "Button test",
        description: "tests the button",
        action: {
          type: "button",
          onClick: (evt) => { console.log("Button clicked!"); },
          content: "Button"
        }
      },
    ]
  };
  extensionAPI.settings.panel.create(panelConfig);
  const thread = [
    "Here's the first post in my thread!",
    "Here's the second post with more details...",
    "And here's the final post to wrap things up!"
  ]
  extensionAPI.ui.commandPalette.addCommand({
    label: '🦋 Post to Bluesky',
    callback: () => {
      let block = window.roamAlphaAPI.ui.getFocusedBlock();
      if (block != null) {


        let blocks = extractBlocks(
          block['block-uid']
        );
        console.log(blocks);
        postThread(blocks, extensionAPI)

      }
    },
    "disable-hotkey": false,
    "default-hotkey": "ctrl-shift-p"
  });
  // const result = await postThread(thread)
  console.log(`${pkg.name} version ${pkg.version} loaded`);
}

function onunload() {
  console.log(`${pkg.name} version ${pkg.version} unloaded`);
}

export default {
  onload,
  onunload
};