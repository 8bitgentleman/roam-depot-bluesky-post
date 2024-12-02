import pkg from '../package.json';
import { RichText, AtpAgent } from '@atproto/api';
import { showToast } from './components/toast';
import BlueskyLoginPanel from './components/BlueskyLoginPanel';
import DateAppendSetting from './components/DateAppendSetting';

const BLUESKY_CHAR_LIMIT = 300;
const BLOCK_REF_REGEX = /\(\(([\w\d-]{9,10})\)\)/;
const PAGE_REF_REGEX = /\[\[(.*?)\]\]/g;

function getLoginInfo(extensionAPI) {
  return extensionAPI.settings.get('loginInfo') || null
}

function getAppendDateSettings(extensionAPI) {
  return {
    enabled: extensionAPI.settings.get('appendDate') || false,
    template: extensionAPI.settings.get('appendTemplate') || 'sent on {DATE}'
  };
}

async function updateBlockWithPostDate(blockUid, extensionAPI) {
  const currentDate = new Date();
  const pageTitle = window.roamAlphaAPI.util.dateToPageTitle(currentDate);
  const { template } = getAppendDateSettings(extensionAPI);

  // Get current block string
  const currentBlock = window.roamAlphaAPI.data.pull(
    '[:block/string]',
    [':block/uid', blockUid]
  );

  const currentString = currentBlock?.[':block/string'] || '';
  const appendText = template.replace('{DATE}', `[[${pageTitle}]]`);
  const newString = `${currentString} ${appendText}`;

  // Update the block
  return window.roamAlphaAPI.data.block.update({
    block: {
      uid: blockUid,
      string: newString
    }
  });
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

async function validateBlocks(blocks) {
  const errors = [];
  
  blocks.forEach((block, index) => {
    const position = index === 0 ? "root" : `reply #${index}`;
    const textLength = block.text.length;
    
    if (textLength > BLUESKY_CHAR_LIMIT) {
      errors.push({
        position,
        length: textLength,
        limit: BLUESKY_CHAR_LIMIT,
        overage: textLength - BLUESKY_CHAR_LIMIT
      });
    }
  });
  
  if (errors.length > 0) {
    const errorMessages = errors.map(error => 
      `${error.position} post is ${error.length} characters (${error.overage} over ${error.limit} limit)`
    );
    throw new Error(`Character limit exceeded:\n${errorMessages.join('\n')}`);
  }
  
  return true;
}

async function extractBlocks(uid, agent) {
  const pattern = `[
    :block/string 
    {:block/children [:block/string :block/order]}
  ]`;

  const result = window.roamAlphaAPI.data.pull(
    pattern,
    [":block/uid", uid]
  );

  const processedMainBlock = await processBlockWithAgent(result[":block/string"] || '', agent);
  const processedBlocks = [processedMainBlock];

  if (result && result[":block/children"]?.length > 0) {
    const processedChildren = await Promise.all(
      result[":block/children"]
        .sort((a, b) => a[":block/order"] - b[":block/order"])
        .map(child => processBlockWithAgent(child[":block/string"] || '', agent))
    );

    processedBlocks.push(...processedChildren);
  }

  // make sure all blocks are under 300 char before returning
  await validateBlocks(processedBlocks);

  return processedBlocks;
}

async function postToBluesky(blockUid, extensionAPI) {
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
    const blocks = await extractBlocks(blockUid, agent);

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

    if (blocks.length === 1) {
      console.log("getAppendDateSettings", getAppendDateSettings(extensionAPI));

      if (getAppendDateSettings(extensionAPI).enabled) {
        await updateBlockWithPostDate(blockUid, extensionAPI);
      }
      return rootPost;
    }

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
    console.log("reply posted: now updating origional block");

    console.log("getAppendDateSettings", getAppendDateSettings(extensionAPI));

    if (getAppendDateSettings(extensionAPI).enabled) {
      await updateBlockWithPostDate(blockUid, extensionAPI);
    }

    return rootPost;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(error.message || 'Failed to post to Bluesky');
  }
}

async function onload({ extensionAPI }) {
  const panelConfig = {
    tabTitle: "Post to Bluesky",
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
        id: "dateAppend",
        name: "Date Append Settings",
        action: {
          type: "reactComponent",
          component: DateAppendSetting(extensionAPI)
        }
      }
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