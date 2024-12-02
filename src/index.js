import pkg from '../package.json';
import { RichText, AtpAgent } from '@atproto/api';
import { showToast } from './components/toast';
import BlueskyLoginPanel from './components/BlueskyLoginPanel';

const BLUESKY_CHAR_LIMIT = 300;
const BLOCK_REF_REGEX = /\(\(([\w\d-]{9,10})\)\)/;
const PAGE_REF_REGEX = /\[\[(.*?)\]\]/g;

function getLoginInfo(extensionAPI) {
  return extensionAPI.settings.get('loginInfo') || null
}

async function fetchImageAsBlob(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return blob;
}

async function uploadImages(mediaUrls, agent) {
  if (!mediaUrls.length) return null;
  
  try {
    const uploadedImages = await Promise.all(
      mediaUrls.map(async (url) => {
        // Fetch the image
        const mediaBlob = await fetchImageAsBlob(url);
        
        // Convert blob to Uint8Array for Bluesky's API
        const arrayBuffer = await mediaBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Upload to Bluesky
        const { data: uploadData } = await agent.uploadBlob(uint8Array, {
          encoding: mediaBlob.type || 'image/jpeg'
        });

        if (!uploadData?.blob) {
          throw new Error('Failed to upload image: No blob reference returned');
        }

        // Return the properly formatted image object
        return {
          alt: 'Image from Roam Research', // Could make this configurable
          image: uploadData.blob,
        };
      })
    );

    // Return the properly formatted embed
    return {
      $type: 'app.bsky.embed.images',
      images: uploadedImages
    };
    
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error(`Failed to upload images: ${error.message}`);
  }
}

async function processBlock(blockString) {
  if (!blockString) {
    return { text: '', mediaUrls: [], facets: [] };
  }

  // First extract any media attachments
  const mediaUrls = [];
  const textWithoutMedia = blockString.replace(/!\[[^\]]*\]\(([^\s)]*)\)/g, (_, url) => {
    mediaUrls.push(url.replace("www.dropbox.com", "dl.dropboxusercontent.com"));
    return "";
  });

  // Then resolve block references
  const textWithResolvedRefs = textWithoutMedia.replace(BLOCK_REF_REGEX, (_, blockUid) => {
    const reference = window.roamAlphaAPI.data.pull(
      '[:block/string]',
      [':block/uid', blockUid]
    )?.[':block/string'];
    return reference || '';
  });

  // Process page references - convert to hashtags
  const textWithHashtags = textWithResolvedRefs.replace(PAGE_REF_REGEX, (match, pageName) => {
    return `#${pageName.replace(/\s+/g, '')}`;
  });

  // Create RichText instance with processed text
  const rt = new RichText({ text: textWithHashtags.trim() });
  
  // Initialize facets
  await rt.detectFacets();

  return {
    text: rt.text || '',
    facets: rt.facets || [],
    mediaUrls: mediaUrls || []
  };
}

async function processBlockWithAgent(blockString, agent) {
  if (!blockString) {
    return { text: '', mediaUrls: [], facets: [] };
  }

  // First extract any media attachments
  const mediaUrls = [];
  const textWithoutMedia = blockString.replace(/!\[[^\]]*\]\(([^\s)]*)\)/g, (_, url) => {
    mediaUrls.push(url.replace("www.dropbox.com", "dl.dropboxusercontent.com"));
    return "";
  });

  // Then resolve block references
  const textWithResolvedRefs = textWithoutMedia.replace(BLOCK_REF_REGEX, (_, blockUid) => {
    const reference = window.roamAlphaAPI.data.pull(
      '[:block/string]',
      [':block/uid', blockUid]
    )?.[':block/string'];
    return reference || '';
  });

  // Process aliases and standard links
  const textWithLinks = textWithResolvedRefs.replace(/\[(.*?)\]\((.*?)\)/g, '$2');

  // Process page references - convert to hashtags
  const textWithHashtags = textWithLinks.replace(PAGE_REF_REGEX, (match, pageName) => {
    return `#${pageName.replace(/\s+/g, '')}`;
  });

  // Create RichText instance with processed text
  const rt = new RichText({ text: textWithHashtags.trim() });
  
  // Initialize facets with agent
  await rt.detectFacets(agent);

  return {
    text: rt.text || '',
    facets: rt.facets || [],
    mediaUrls: mediaUrls || []
  };
}

async function extractBlocks(uid, agent) {
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
  console.log("result", result);

  // Process the main block
  const processedMainBlock = await processBlockWithAgent(result[":block/string"] || '', agent);
  console.log("processedMainBlock", processedMainBlock);

  // Initialize array with the processed main block
  const processedBlocks = [processedMainBlock];

  // If children exist, sort and process them
  if (result && result[":block/children"]?.length > 0) {
    const processedChildren = await Promise.all(
      result[":block/children"]
        .sort((a, b) => a[":block/order"] - b[":block/order"])
        .map(child => processBlockWithAgent(child[":block/string"] || '', agent))
    );

    processedBlocks.push(...processedChildren);
  }

  return processedBlocks;
}

async function postToBluesky(processedBlocks, extensionAPI) {
  const loginInfo = getLoginInfo(extensionAPI);
  if (!loginInfo) {
    throw new Error("No Bluesky login saved - please add your login info in settings");
  }

  const agent = new AtpAgent({
    service: 'https://bsky.social'
  });

  try {
    await agent.login({
      identifier: loginInfo.username,
      password: loginInfo.password
    });

    // Get processed blocks with the agent
    const blocks = await extractBlocks(processedBlocks, agent);

    // Process root post
    const rootBlock = blocks[0];
    const rootEmbed = rootBlock.mediaUrls.length > 0 ? 
      await uploadImages(rootBlock.mediaUrls, agent) : null;

    // Create root post record
    const rootRecord = {
      $type: 'app.bsky.feed.post',
      text: rootBlock.text,
      facets: rootBlock.facets,
      createdAt: new Date().toISOString()
    };

    if (rootEmbed) {
      rootRecord.embed = rootEmbed;
    }

    // Post root
    const rootPost = await agent.api.app.bsky.feed.post.create(
      { repo: agent.session?.did },
      rootRecord
    );

    if (blocks.length === 1) return rootPost;

    // Process thread
    let parentPost = rootPost;
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Skip completely empty blocks
      if (!block.text && block.mediaUrls.length === 0) {
        console.log(`Skipping empty block at index ${i}`);
        continue;
      }

      // Prepare reply reference
      const replyRef = {
        root: {
          uri: rootPost.uri,
          cid: rootPost.cid
        },
        parent: {
          uri: parentPost.uri,
          cid: parentPost.cid
        }
      };

      // Handle any images in the reply
      const replyEmbed = block.mediaUrls.length > 0 ?
        await uploadImages(block.mediaUrls, agent) : null;

      // Create reply record
      const replyRecord = {
        $type: 'app.bsky.feed.post',
        text: block.text,
        facets: block.facets,
        createdAt: new Date().toISOString(),
        reply: replyRef
      };

      if (replyEmbed) {
        replyRecord.embed = replyEmbed;
      }

      // Post reply
      parentPost = await agent.api.app.bsky.feed.post.create(
        { repo: agent.session?.did },
        replyRecord
      );
    }

    return rootPost;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(error.message || 'Failed to post to Bluesky');
  }
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

  extensionAPI.ui.commandPalette.addCommand({
    label: '🦋 Post to Bluesky',
    callback: async () => {
      let block = window.roamAlphaAPI.ui.getFocusedBlock();
      if (block != null) {
        try {
          await postToBluesky(block['block-uid'], extensionAPI);
          showToast(`Thread posted to Bluesky successfully`, "SUCCESS");
        } catch (error) {
          showToast(`Error: ${error.message}`, "DANGER");
          console.error('Bluesky posting error:', error);
        }
      }
    },
    "disable-hotkey": false,
    "default-hotkey": "ctrl-shift-p"
  });

  console.log(`${pkg.name} version ${pkg.version} loaded`);
}

function onunload() {
  console.log(`${pkg.name} version ${pkg.version} unloaded`);
}

export default {
  onload,
  onunload
};