// supabase/functions/submit-phobia-report/index.ts
import { serve } from "https://deno.land/std@0.178.0/http/server.ts";

// Edge Functionの起動時に一度だけ表示されるログ
console.log("Edge Function 'submit-phobia-report' initialized.");

serve(async (req) => {
    // リクエストが来るたびに表示されるログ
    console.log("Received a new request.");

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // すべてのオリジンからのアクセスを許可（開発用）
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // 許可するメソッド
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
        'Access-Control-Max-Age': '86400', // プリフライトリクエストのキャッシュ時間
    };

    // プリフライトリクエスト (OPTIONSメソッド) への対応
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS preflight request.');
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    if (req.method !== 'POST') {
        console.warn(`Method Not Allowed: ${req.method}`);
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }

    try {
        // ★★★ このオブジェクトのデストラクチャリングから「time」を削除しました ★★★
        const requestBody = await req.json();
        const { movieId, phobias, otherPhobia, details } = requestBody; 

        console.log("Parsed request payload:", { movieId, phobias, otherPhobia, details });

        const hasUrl = (text: string | null | undefined) => {
            if (!text) return false;
            return /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g.test(text);
        };

        if (hasUrl(otherPhobia) || hasUrl(details)) {
            console.warn(`[MODERATION BLOCKED] URL detected in submission for movie ID: ${movieId}`);
            return new Response(JSON.stringify({ error: "投稿内容にURLが含まれています。URLの投稿はブロックされます。" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
        const NOTION_DATABASE_ID = Deno.env.get("NOTION_DATABASE_ID");
        const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY"); 

        console.log("Notion API Key (partial):", NOTION_API_KEY ? NOTION_API_KEY.substring(0, 5) + '...' + NOTION_API_KEY.substring(NOTION_API_KEY.length - 5) : 'Not Set');
        console.log("Notion Database ID:", NOTION_DATABASE_ID || 'Not Set');
        console.log("TMDB API Key (partial):", TMDB_API_KEY ? TMDB_API_KEY.substring(0, 5) + '...' + TMDB_API_KEY.substring(TMDB_API_KEY.length - 5) : 'Not Set');

        if (!NOTION_API_KEY || !NOTION_DATABASE_ID || !TMDB_API_KEY) {
            console.error("Server configuration error: Notion API Key, Database ID, or TMDB API Key not set in environment variables.");
            return new Response(JSON.stringify({ error: "サーバー設定エラー：必要なAPIキーが設定されていません。" }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        let movieTitle = String(movieId);
        const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
        const TMDB_MOVIE_DETAIL_URL = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=ja-JP`;

        try {
            console.log(`Fetching movie title from TMDB for ID: ${movieId}`);
            const movieResponse = await fetch(TMDB_MOVIE_DETAIL_URL);
            if (movieResponse.ok) {
                const movieData = await movieResponse.json();
                movieTitle = movieData.title || String(movieId);
                console.log(`Successfully fetched movie title: "${movieTitle}" for ID: ${movieId}`);
            } else {
                const errorText = await movieResponse.text();
                console.warn(`Failed to fetch movie title from TMDB for ID ${movieId}. Status: ${movieResponse.status}, Body: ${errorText}`);
            }
        } catch (e: any) {
            console.error(`Error during TMDB API call for movie ID ${movieId}: ${e.message}`);
        }

        const properties: { [key: string]: any } = {
            "映画ID": { // Notionデータベースの「タイトル」プロパティの名前
                title: [{ type: "text", text: { content: movieTitle } }], 
            },
            "恐怖要素": { 
                multi_select: phobias.map((p: string) => ({ name: p })),
            },
            "その他恐怖要素": {
                rich_text: [{ type: "text", text: { content: otherPhobia || "" } }],
            },
            "詳細": { 
                rich_text: [{ type: "text", text: { content: details || "" } }],
            },
            // ★★★ ここから「出現時間」を完全に削除しました。今後、このプロパティはNotionへ送信されません。★★★
            "ステータス": { // モデレーション用の初期ステータス
                select: { name: "Pending" }, 
            },
            "情報源": {
                select: { name: "ユーザー" }, // ユーザーからの投稿であることを示す
            },
            // 「投稿日時」はNotionの「Created time」タイプの場合、APIで設定不要です。
        };
        console.log("Notion properties payload:", JSON.stringify(properties, null, 2));

        console.log("Attempting to send data to Notion API...");
        const notionResponse = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
                "Authorization": `Bearer ${NOTION_API_KEY}`,
            },
            body: JSON.stringify({
                parent: { database_id: NOTION_DATABASE_ID },
                properties: properties,
            }),
        });

        const notionResponseBody = await notionResponse.text();
        console.log(`Notion API Response Status: ${notionResponse.status}`);
        console.log(`Notion API Response Body: ${notionResponseBody}`);

        if (!notionResponse.ok) {
            let errorData;
            try {
                errorData = JSON.parse(notionResponseBody);
            } catch (e) {
                errorData = { message: "Notion API returned non-JSON error response or empty body." };
            }
            console.error("Notion API Error (details from Notion):", errorData);
            return new Response(JSON.stringify({ error: "Notionへの保存に失敗しました。", details: errorData }), {
                status: 500,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        console.log("Phobia report successfully processed and sent to Notion.");
        return new Response(JSON.stringify({ message: "投稿が成功しました！" }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });

    } catch (error: any) {
        console.error("Supabase Function internal error:", error.message);
        return new Response(JSON.stringify({ error: "サーバー内部でエラーが発生しました。", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
});
