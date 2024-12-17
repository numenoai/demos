<?php

/**
 * Plugin Name: Numeno Article Recommender Slackbot
 * Plugin URI: https://github.com/numenoai/
 * Description: Demo code from Numeno.ai - a Wordpress Plugin for the backend of a Slackbot command that fetches articles from a Numeno Article Recommender Feed.
 * Version: 1.0
 * Author: Numeno
 * Author URI: https://numeno.ai/
 * License: Expat
 * License URI: https://opensource.org/license/mit
 */

////////////////////////////////////////////////////////////////////////////////
// Environment.  Replace this with your favourite way of storing secrets.

require_once __DIR__ . '/vendor/autoload.php';

$dotenv = \Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

function defaultFeedID()
{
    return $_ENV['DEFAULT_FEED_ID'];
}
function numenoAPIKey()
{
    return $_ENV['NUMENO_API_KEY'];
}
function numenoFeedsEndpoint()
{
    return $_ENV['NUMENO_FEEDS_ENDPOINT'];
}
function slackWebhookURL()
{
    return $_ENV['SLACK_WEBHOOK_URL'];
}

////////////////////////////////////////////////////////////////////////////////
// Register routes with the Wordpress server.
function custom_slackbot_endpoints()
{
    register_rest_route('slackbot/art-rec/v1', '/articles/', array(
        'methods' => 'POST',
        'callback' => 'handle_slackbot_articles',
    ));
    register_rest_route('slackbot/art-rec/v1', '/interact/', array(
        'methods' => 'POST',
        'callback' => 'handle_slackbot_interact',
    ));
}
add_action('rest_api_init', 'custom_slackbot_endpoints');

////////////////////////////////////////////////////////////////////////////////
// Called when a user interacts with the Slack Block UI.
function handle_slackbot_interact(WP_REST_Request $request)
{
    // Parse the JSON payload.
    $payload = json_decode($request->get_param('payload'), true);
    if (json_last_error() !== JSON_ERROR_NONE || empty($payload)) {
        return new WP_REST_Response('Invalid payload', 400);
    }

    if ($payload['type'] === 'block_actions') {
        $actions = $payload['actions'] ?? [];
        foreach ($actions as $action) {
            // Handle cursor-button action.
            if (
                $action['type'] === 'button'
                && $action['action_id'] === 'cursor_button'
            ) {
                $feedID = defaultFeedID();
                $cursor = $action['value'];
                $articlesAsJson = fetchFeed($feedID, $cursor);
                $slackBlocks = parseFeedToSlackBlocks($articlesAsJson);
                pushBlocksToSlack($slackBlocks);

                // Return a response.
                return new WP_REST_Response('Button interaction handled', 200);
            }
        }
    }

    return new WP_REST_Response('No interaction handled', 200);
}

////////////////////////////////////////////////////////////////////////////////
// Called when a user issues the /articles command in a Slack channel.
function handle_slackbot_articles(WP_REST_Request $request)
{
    // Extract feedID from the Slack command, if one was specified.
    $data = $request->get_params();
    $text = isset($data['text']) ? sanitize_text_field($data['text']) : '';
    $feed = !empty($text) ? $text : defaultFeedID();

    $articlesAsJson = fetchFeed($feed);
    $slackBlocks = parseFeedToSlackBlocks($articlesAsJson);
    pushBlocksToSlack($slackBlocks);

    // Return a response.
    $responseMsg = "Request $text received and processed";
    return new WP_REST_Response($responseMsg, 200);
}

////////////////////////////////////////////////////////////////////////////////
// Called when a user issues the /articles command in a Slack channel.
function fetchFeed($feedID, $cursor = null)
{
    // Pull Articles from the Feed 5 at a time.
    $baseUrl = numenoFeedsEndpoint() . '/' . $feedID . '/articles?limit=5';

    // Append a cursor if present.
    $cursorArg = '';
    if (!empty($cursor)) {
        $cursorArg = '&cursor=' . $cursor;
    }

    $numenoKey = 'X-Numeno-Key:' . numenoAPIKey();

    // Initialize cURL session.
    $curl = curl_init($baseUrl . $cursorArg);
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'GET',
        CURLOPT_HTTPHEADER => array(
            'Accept: application/json',
            $numenoKey
        ),
    ));

    // Execute cURL request and check for errors.
    $response = curl_exec($curl);
    if (curl_errno($curl)) {
        echo 'Error: ' . curl_error($curl);
    }
    curl_close($curl);

    return $response;
}

////////////////////////////////////////////////////////////////////////////////
// Uploads Slack blocks to your Slack Workspace webhook.
function pushBlocksToSlack($slackBlocks)
{
    // Payload to send.
    $data = [
        "text" => "These are recommendations from the Numeno Article Recommender API - https://numeno.ai/",
        "blocks" => $slackBlocks
    ];

    // Initialize cURL session.
    $curl = curl_init(slackWebhookURL());
    curl_setopt_array($curl, array(
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_RETURNTRANSFER => true,
    ));

    // Execute cURL request and check for errors.
    $response = curl_exec($curl);
    if (curl_errno($curl)) {
        echo 'Error: ' . curl_error($curl);
    }
    curl_close($curl);

    return $response;
}

////////////////////////////////////////////////////////////////////////////////
// Maps Numeno Articles to Slack blocks.
function parseFeedToSlackBlocks($articlesAsJson)
{
    // Decode the JSON data.
    $data = json_decode($articlesAsJson, true);

    $slackBlocks[] = [
        "type" => "section",
        "text" => [
            "type" => "mrkdwn",
            "text" => "Your articles, courtesy of Numeno - https://numeno.ai/",
        ]
    ];

    // Check if the data contains Numeno Articles.
    if (isset($data['articles']) && is_array($data['articles'])) {
        foreach ($data['articles'] as $article) {
            // Add a divider between Articles.
            $slackBlocks[] = ["type" => "divider"];

            // Strip tags (eg. md, html) and clamp to 300 chars.
            $stripped = trim(strip_tags($article['summary']));
            if (strlen($stripped) > 300) {
                $formatted = substr($stripped, 0, 300);
                if (strlen($formatted) == 300)
                    $formatted = $formatted . '...';
            } else
                $formatted = $stripped;

            // Map Numeno Article fields to the Slack block structure.
            $slackBlock = [
                "type" => "section",
                "block_id" => "section_" . $article['id'],
                "text" => [
                    "type" => "mrkdwn",
                    "text" => sprintf(
                        "<%s | *%s*>\n_%s_\n%s",
                        $article['href'],
                        $article['title'],
                        $formatted,
                        $article['title']
                    )
                ],
                "accessory" => [
                    "type" => "image",
                    "image_url" => $article['thumbnail'],
                    "alt_text" => $article['title']
                ]
            ];

            // Add the block to the array.
            $slackBlocks[] = $slackBlock;
        }

        $slackBlocks[] = ["type" => "divider"];

        // Add a cursor button for pagination, if we have
        // yet to reah the end of the Feed.
        if (!empty($data['cursor'])) {
            $slackBlocks[] = [
                "type" => "section",
                "text" => [
                    "type" => "mrkdwn",
                    "text" => "Cursor: `" . $data['cursor'] . "`",
                ],
                "accessory" => [
                    "type" => "button",
                    "text" => [
                        "type" => "plain_text",
                        "text" => "Load Next 5",
                        "emoji" => true
                    ],
                    "value" => $data['cursor'],
                    "action_id" => "cursor_button"
                ]
            ];
        }
    } else {
        echo "No Articles found in the JSON data.";
    }
    return $slackBlocks;
}
