import * as NumenoAdmin from "@waverlyai/api-admin"
import * as NumenoArtRec from "@waverlyai/api-art-rec"

///////////////////////////////////////////////////////////////////////////////
// Environment.  Replace this with your favourite way of storing secrets.

import dotenv from "dotenv"

function loadEnv() {
  dotenv.config()
}

function numenoAdminKey() {
  return process.env.NUMENO_ADMIN_KEY || ""
}

///////////////////////////////////////////////////////////////////////////////
// Create interfaces to the Numeno APIs.

function numenoAdminAPI(apiKey: string) {
  const artRecConfig = new NumenoAdmin.Configuration({ apiKey })
  return new NumenoAdmin.DefaultApi(artRecConfig)
}

function numenoArtRecAPI(apiKey: string) {
  const artRecConfig = new NumenoArtRec.Configuration({ apiKey })
  return new NumenoArtRec.DefaultApi(artRecConfig)
}

///////////////////////////////////////////////////////////////////////////////
// Cleanup functions.

async function cleanupKey(
  adminAPI: NumenoAdmin.DefaultApi,
  keyToDelete: string,
) {
  if (keyToDelete) {
    try {
      await adminAPI.deleteKey({ key: keyToDelete })
      console.log("Key deleted successfully")
    } catch (error) {
      console.log("Error deleting key:", error)
    }
  }
}

async function cleanupFeed(artRecAPI: NumenoArtRec.DefaultApi, feedId: string) {
  if (feedId) {
    try {
      await artRecAPI.deleteFeed({ id: feedId })
      console.log("Feed deleted successfully")
    } catch (error) {
      console.log("Error deleting feed:", error)
    }
  }
}

///////////////////////////////////////////////////////////////////////////////
// Helper functions.

async function createKey(
  adminAPI: NumenoAdmin.DefaultApi,
  scopes: string[],
): Promise<string> {
  let newKey = ""
  try {
    const result = await adminAPI.createKey({ keyNew: { scopes } })
    console.log("Key created successfully")
    newKey = result.key
  } catch (error) {
    console.log("Error creating key:", error)
  }

  // Demonstrate how to look up info for a key. Not strictly necessary.
  if (newKey) {
    try {
      const keyInfo = await adminAPI.getKey({ key: newKey })
      console.log("Key info:", keyInfo)
    } catch (error) {
      console.log("Error getting key info:", error)
    }
  }

  return newKey
}

///////////////////////////////////////////////////////////////////////////////
// Main function.

async function main() {
  const adminAPI = numenoAdminAPI(numenoAdminKey())

  // Use the Admin API to create a Key for the Article Recommender API.
  // For this demo, we need read-write access for Feeds.
  // In general you wouldn't create a key every time you need one
  const artRecKey = await createKey(adminAPI, [
    "art-rec:feeds:write",
    "art-rec:articles:read",
  ])

  // We can't continue without a key.
  if (!artRecKey) {
    console.log("Aborting")
    return
  }

  /////////////////////////////////////////////////////////////////////////////
  // Create an interface to the Numeno Article Recommender API.

  const artRecAPI = numenoArtRecAPI(artRecKey)

  // Use the Article Recommender API to create a Feed and a bunch of Streams.
  let feedId = ""
  let feedFullyInitialized = false
  try {
    const feedResult = await artRecAPI.createFeed({
      feedNew: {
        name: "FriendlyNameOfFeed",
        schedule: {
          interval: "daily",
          hour: 20,
        },
        tuner: {
          prompt:
            "Remove from the Feed Articles that are duplicates from one another based on overlapping Topics. Remove Articles that are doing too much marketing or promotion. Lower the score for listicles.",
          canMask: true,
        },
      },
    })
    console.log("Feed created successfully")
    feedId = feedResult.id

    // Create a few Streams for the Feed. These specify the topics
    // and sources we're interested in. The max number of Streams per Feed
    // will depend on your subscription plan.
    //
    // sources: an allow or deny-list of sources we want to see or avoid.
    //
    // topics: the topics we're interested in, or absolutely not interested in.
    //
    // volumeControl: the approximate number of Articles to take from the query
    //                each day. The max value depends on your subscription plan.

    // In this example, we create three Streams with topics aligning along
    // compassion, awareness, and learning.
    let query = [
      {
        topics: {
          mustHave: ["COMPASSION", "LOVE", "EMPATHY"],
          mustNotHave: ["HATE"],
          shouldHave: [{ topic: "FORGIVENESS", weight: 0.9 }],
        },
        volumeControl: { dailyRate: 25 },
      },
      {
        topics: {
          mustHave: ["AWARENESS", "MINDFULNESS", "GRATITUDE"],
          mustNotHave: ["IGNORANCE"],
          shouldHave: [{ topic: "CONSCIOUSNESS", weight: 0.5 }],
        },
        volumeControl: { dailyRate: 25 },
      },
      {
        topics: {
          mustHave: ["LEARNING", "UNDERSTANDING", "KNOWLEDGE", "WISDOM"],
          mustNotHave: ["SELFISHNESS"],
          shouldHave: [
            { topic: "HUMILITY", weight: 0.5 },
            { topic: "GROWTH", weight: 0.5 },
          ],
        },
        volumeControl: { dailyRate: 25 },
      },
    ]

    // Create the Streams with placeholder names. In a real scenario, you'd
    // use meangingful names to help reference the Streams later.
    const streamPromises: Promise<NumenoArtRec.Stream>[] = []
    for (let i = 0; i < query.length; i++) {
      const streamName = `Test stream ${i + 1}`
      const streamNew = {
        name: streamName,
        query: query[i],
      }
      streamPromises.push(artRecAPI.createStream({ feedId, streamNew }))
    }

    // Wait for Stream creation to finish.
    const streamResults = await Promise.all(streamPromises)
    console.log("Streams created successfully:", streamResults)
    feedFullyInitialized = true
  } catch (error) {
    console.log("Error creating feed or streams:", error)
  }

  //////////////////////////////////////////////////////////////////////////////
  // Examples of Stream operations.

  if (feedFullyInitialized) {
    try {
      // Get all Streams for a Feed.
      const streamsResult = await artRecAPI.getStreams({ feedId })
      console.log("Streams retrieved successfully:", streamsResult.streams)

      // Get a specific Stream.
      const streamId = streamsResult.streams[0]?.id || "your-stream-id-here"
      const streamResult = await artRecAPI.getStreamById({
        feedId,
        id: streamId,
      })
      console.log("Stream retrieved successfully:", streamResult)

      // Update a Stream - in this case we'll just change the name.
      const updatedStream = {
        name: "Updated Stream Name",
        // Put updated sources / topics / volumeControl in the query,
        // as desired.
        // query: { },
      }
      const updateResult = await artRecAPI.updateStream({
        feedId,
        id: streamId,
        streamUpdate: updatedStream,
      })
      console.log("Stream updated successfully:", updateResult)

      // Delete a Stream.
      await artRecAPI.deleteStream({ feedId, id: streamId })
      console.log("Stream deleted successfully")
    } catch (error) {
      console.log("Error:", error)
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Examples of Feed operations.

  if (feedFullyInitialized) {
    // Demonstrate a bunch of Feed operations from artRecAPI
    try {
      // Get all Feeds.
      const feedsResult = await artRecAPI.getFeeds()
      console.log("Feeds retrieved successfully:", feedsResult.feeds)

      // Get a specific Feed.
      const feedResult = await artRecAPI.getFeedById({ id: feedId })
      console.log("Feed retrieved successfully:", feedResult)

      // Update a Feed - in this case we'll add a bit more to the tuner prompt.
      // Leave what's present, which does a decent job of de-duping the Feed.
      const existingTunerPrompt = feedResult?.tuner?.prompt || ""
      const updatedFeed = {
        tuner: {
          prompt:
            existingTunerPrompt +
            " Also attempt to filter out articles that are overly hostile or toxic in tone.",
        },
      }
      const updateFeedResult = await artRecAPI.updateFeed({
        id: feedId,
        feedUpdate: updatedFeed,
      })
      console.log("Feed updated successfully:", updateFeedResult)

      // Refresh a Feed. This is a way to populate the Feed with fresh Articles
      // without waiting for the Feed's regular schedule. The behaviour of this
      // call is tied to your subscription.
      await artRecAPI.refreshFeed({ feedId })
      console.log("Feed refreshed successfully")

      // This is how you'd get the Articles from the Feed. We'll fetch them
      // five-at-a-time to demonstrate pagination.
      let articles: NumenoArtRec.Article[] = []
      let cursor: string | undefined = undefined
      do {
        const articlesResult = await artRecAPI.getArticlesInFeed({
          feedId,
          cursor,
          limit: 5,
        })
        articles = articles.concat(articlesResult.articles)
        cursor = articlesResult.cursor
      } while (cursor)
      console.log("Articles retrieved successfully:", articles)

      // You can also get an Article by its ID, independently of the Feed.
      // Make sure your API Key includes the "art-rec:articles:read" scope.
      // To get the full article text, visit the source URL stored in the
      // article.href property.
      //
      // const articleId = articles[0]?.id || "your-article-id-here";
      // const article = await artRecAPI.getArticleById({ id: articleId })
    } catch (error) {
      console.log("Error:", error)
    }
  }

  /////////////////////////////////////////////////////////////////////////////
  // We're done! Cleanup time.
  await cleanupFeed(artRecAPI, feedId)
  await cleanupKey(adminAPI, artRecKey)
}

// Run the demo!
loadEnv()
main()
