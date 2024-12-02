import pkg from '../package.json';
import { AtpAgent, BlobRef } from '@atproto/api'
import { AppBskyFeedPost } from '@atproto/api'

const panelConfig = {
  tabTitle: pkg.name,
  settings: [
      {id:          "button-setting",
       name:        "Button test",
       description: "tests the button",
       action:      {type:    "button",
                     onClick: (evt) => { console.log("Button clicked!"); },
                     content: "Button"}},
      {id:          "switch-setting",
       name:        "Switch Test",
       description: "Test switch component",
       action:      {type:     "switch",
                     onChange: (evt) => { console.log("Switch!", evt); }}},
      {id:     "input-setting",
       name:   "Input test",
       action: {type:        "input",
                placeholder: "placeholder",
                onChange:    (evt) => { console.log("Input Changed!", evt); }}},
      {id:     "select-setting",
       name:   "Select test",
       action: {type:     "select",
                items:    ["one", "two", "three"],
                onChange: (evt) => { console.log("Select Changed!", evt); }}}
  ]
};


async function postThread(posts, extensionAPI) {
  // Initialize the ATP agent
  const agent = new AtpAgent({
    service: 'https://bsky.social'
  })
  
  
  // Login to Bluesky
  await agent.login({
    identifier: '',
    password: ''
  })
  console.log(agent);
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

  return rootPost
}

async function onload({extensionAPI}) {
  extensionAPI.settings.panel.create(panelConfig);
  const thread = [
    "Here's the first post in my thread!",
    "Here's the second post with more details...",
    "And here's the final post to wrap things up!"
  ]

  const result = await postThread(thread)
  console.log(`${pkg.name} version ${pkg.version} loaded`);
}

function onunload() {
  console.log(`${pkg.name} version ${pkg.version} unloaded`);
}

export default {
  onload,
  onunload
};