// supabase/functions/get-phobia-reports/index.ts
import { serve } from "https://deno.land/std@0.178.0/http/server.ts"; // Deno.serve ではなく serve を使用

// Edge Functionの起動時に一度だけ表示されるログ
console.log("Edge Function 'get-phobia-reports' initialized.");

serve(async (req) => { // Deno.serve ではなく serve を使用
    // リクエストが来るたびに表示されるログ
    console.log("Received a new request for get-phobia-reports.");

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // すべてのオリジンからのアクセスを許可（開発用）
        'Access-Control-Allow-Methods': 'GET, OPTIONS', // 許可するメソッド
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey', // ヘッダーをより包括的に
        'Access-Control-Max-Age': '86400', // プリフライトリクエストのキャッシュ時間
    };

    // プリフライトリクエスト (OPTIONSメソッド) への対応
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request for get-phobia-reports.');
        // 修正点: 204 No Content のレスポンスにはボディを含めない
        return new Response(null, { // 'ok' ではなく null を指定
            status: 204,
            headers: corsHeaders,
        });
    }

    // GETリクエストのみを受け付ける
    if (req.method !== 'GET') {
        console.warn(`Method Not Allowed: ${req.method} for get-phobia-reports`);
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }

    try {
        const { searchParams } = new URL(req.url);
        const movieId = searchParams.get('movieId'); // フロントエンドからmovieId（数値）を受け取る

        console.log(`Received request to get phobia reports for movieId: ${movieId}`);

        if (!movieId) {
            console.warn("Bad Request: 'movieId' is required.");
            return new Response(JSON.stringify({ error: "Bad Request: 'movieId' is required." }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
        const NOTION_DATABASE_ID = Deno.env.get("NOTION_DATABASE_ID");
        const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY"); // TMDB APIキーを取得

        console.log("Notion API Key (partial):", NOTION_API_KEY ? NOTION_API_KEY.substring(0, 5) + '...' + NOTION_API_KEY.substring(NOTION_API_KEY.length - 5) : 'Not Set');
        console.log("Notion Database ID:", NOTION_DATABASE_ID || 'Not Set');
        console.log("TMDB API Key (partial):", TMDB_API_KEY ? TMDB_API_KEY.substring(0, 5) + '...' + TMDB_API_KEY.substring(TMDB_API_KEY.length - 5) : 'Not Set');


        if (!NOTION_API_KEY || !NOTION_DATABASE_ID || !TMDB_API_KEY) { // TMDB_API_KEYもチェック対象に追加
            console.error("Server configuration error: Notion API Key, Database ID, or TMDB API Key not set in environment variables for get-phobia-reports.");
            return new Response(JSON.stringify({ error: "サーバー設定エラー：必要なAPIキーが設定されていません。" }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // ★★★ 修正点: TMDBから映画タイトルを取得する処理を追加 ★★★
        let movieTitleToQuery = String(movieId); // 取得できなかった場合のフォールバック
        const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
        const TMDB_MOVIE_DETAIL_URL = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=ja-JP`;

        try {
            console.log(`Fetching movie title from TMDB for ID: ${movieId}`);
            const movieResponse = await fetch(TMDB_MOVIE_DETAIL_URL);
            if (movieResponse.ok) {
                const movieData = await movieResponse.json();
                movieTitleToQuery = movieData.title || String(movieId); // 日本語タイトルを取得
                console.log(`Successfully fetched movie title: "${movieTitleToQuery}" for ID: ${movieId}`);
            } else {
                const errorText = await movieResponse.text();
                console.warn(`Failed to fetch movie title from TMDB for ID ${movieId}. Status: ${movieResponse.status}, Body: ${errorText}`);
            }
        } catch (e: any) {
            console.error(`Error during TMDB API call to get movie title for ID ${movieId}: ${e.message}`);
        }
        // ★★★ 修正点ここまで ★★★

        // Notionデータベースからデータをクエリする
        // フィルタリング: 「映画ID」が取得した日本語タイトルと一致し、かつ「ステータス」が「Approved」であるもの
        const notionQueryPayload = {
            filter: {
                and: [
                    {
                        property: "映画ID", // Notionデータベースのタイトルプロパティ名
                        title: {
                            equals: movieTitleToQuery, // ★★★ 修正点: ここでTMDBから取得したタイトルを使用します ★★★
                        },
                    },
                    {
                        property: "ステータス", // Notionデータベースのステータスプロパティ名
                        select: {
                            equals: "Approved", // 「Approved」に修正済み
                        },
                    },
                ],
            },
        };

        console.log("Notion Query Payload:", JSON.stringify(notionQueryPayload, null, 2));

        const notionResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
            method: "POST", // NotionのクエリAPIはPOSTメソッドを使用
            headers: {
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28", // Notion APIのバージョンを指定
                "Authorization": `Bearer ${NOTION_API_KEY}`,
            },
            body: JSON.stringify(notionQueryPayload),
        });

        const notionResponseBody = await notionResponse.text();
        console.log(`Notion API Response Status: ${notionResponse.status}`);
        console.log(`Notion API Response Body: ${notionResponseBody}`);

        if (!notionResponse.ok) {
            let errorData;
            try {
                errorData = JSON.parse(notionResponseBody);
            } catch (e) {
                errorData = { message: "Notion API returned non-JSON error response or empty body for get-phobia-reports." };
            }
            console.error("Notion API Error (details from Notion for get-phobia-reports):", errorData);
            return new Response(JSON.stringify({ error: "恐怖要素の取得に失敗しました。", details: errorData }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        const notionData = JSON.parse(notionResponseBody);
        console.log("Notion API Response Results:", JSON.stringify(notionData.results, null, 2)); // Notionの生の結果をログに出力

        const reports: { [key: string]: any[] } = {};

        // Notionから取得したデータを整形
        notionData.results.forEach((page: any) => {
            const phobias = page.properties["恐怖要素"]?.multi_select || [];
            const otherPhobia = page.properties["その他恐怖要素"]?.rich_text[0]?.plain_text || "";
            const details = page.properties["詳細"]?.rich_text[0]?.plain_text || "";
            const source = page.properties["情報源"]?.select?.name || "不明"; // 修正点: 「情報源」の取得を追加しました

            phobias.forEach((phobia: { name: string }) => {
                if (!reports[phobia.name]) {
                    reports[phobia.name] = [];
                }
                // 修正点: timeを削除し、sourceを追加しました
                reports[phobia.name].push({ detail: details, source: source });
            });

            // 「その他恐怖要素」がある場合も集計に含める
            if (otherPhobia) {
                const otherPhobiaKey = "その他"; // ここでは固定で「その他」とする
                if (!reports[otherPhobiaKey]) {
                    reports[otherPhobiaKey] = [];
                }
                // 修正点: timeを削除し、sourceを追加しました。otherPhobiaを詳細に含めます。
                reports[otherPhobiaKey].push({ detail: otherPhobia + (details ? ` (${details})` : ''), source: source });
            }
        });

        console.log("Successfully fetched and aggregated phobia reports. Aggregated Reports:", JSON.stringify(reports, null, 2)); // 整形後のレポートをログに出力
        return new Response(JSON.stringify({ reports: reports }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });

    } catch (error: any) {
        console.error("Supabase Function internal error for get-phobia-reports:", error.message);
        return new Response(JSON.stringify({ error: "サーバー内部でエラーが発生しました。", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
});
