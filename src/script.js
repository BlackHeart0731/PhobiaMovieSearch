// =================================================================================
// Initial Setup and DOM Element Acquisition
// =================================================================================
// ★★★ TMDB APIキーをここに設定してください！ ★★★
// 'YOUR_TMDB_API_KEY' の部分をあなたの実際のAPIキーに置き換えてください。
// これが正しくないと、映画情報が表示されません。
const TMDB_API_KEY = '9c5b6fe18f36543b858effdaf87e44e0'; // Replace with your TMDB API key

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Supabase Edge Function Endpoints (Change according to your environment)
// ※These URLs need to be set correctly upon actual deployment.
// デプロイしたSupabase Edge Functionの正確なURLに置き換えてください
const SUBMIT_PHOBIA_URL = 'https://yzkmduhebhwkkywhvqkr.supabase.co/functions/v1/submit-phobia-report'; // これがあなたのNotionのプロジェクトリファレンスと一致しているか再確認してください
const GET_PHOBIA_URL = 'https://yzkmduhebhwkkywhvqkr.supabase.co/functions/v1/get-phobia-reports'; // 正しいEdge FunctionのURL

const GET_FEATURE_URL = 'YOUR_SUPABASE_EDGE_FUNCTION_URL/features'; // 仮のURL、今後の機能用

// DOM Elements
const movieListEl = document.getElementById('movie-list');
const loadMoreBtn = document.getElementById('load-more-btn');
const categoryTabs = document.getElementById('movie-category-tabs');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const modalOverlay = document.getElementById('modal-overlay');
const movieDetailModal = document.getElementById('movie-detail-modal');
const infoModal = document.getElementById('info-modal');

// Application State
let apiPage = 1;
let currentMovieSource = 'category'; // 'category' or 'search'
let currentCategory = 'now_playing'; // Currently displayed category (e.g., now_playing, upcoming, etc.)
let currentSearchQuery = ''; // Current search query
let allLoadedMovies = []; // All movie data loaded from the API
let displayCount = 8; // Number of movie cards currently displayed
let totalResults = 0; // Total number of movies available from the API
let isLoading = false; // Flag for data loading status
let totalApiPages = 1; // Total number of pages available from the API

// Definition of Phobia Elements (User specified)
const PHOBIA_ELEMENTS = ['高所', '閉所', '暗所', '蜘蛛', '蝶', '蟻', '昆虫', '蛙', 'ヘビ', '集合体', '血液描写', '海洋・溺水', '雷', '嘔吐', '注射・先端', 'ピエロ', '幽霊・超常現象', '性的シーン', '死体', 'その他'];

// =================================================================================
// TMDB API Communication
// =================================================================================
/**
 * Asynchronously fetches movie data from the TMDB API.
 * Fetches data based on the current category or search query,
 * and manages the loading flag and total pages.
 */
async function fetchMoviesFromApi() {
    if (isLoading) return; // Prevent double requests if already loading
    // Hide "Load More" button if all movies are loaded and displayed
    if (allLoadedMovies.length > 0 && allLoadedMovies.length >= totalResults) {
        if (loadMoreBtn) loadMoreBtn.style.display = 'none'; // Null check for loadMoreBtn
        return;
    }
    isLoading = true; // Set loading flag
    if (loadMoreBtn) loadMoreBtn.disabled = true; // Disable button to prevent rapid clicks

    let endpoint = currentMovieSource === 'search' 
        ? '/search/movie' 
        : `/movie/${currentCategory}`;
    
    let url = `${TMDB_BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}&language=ja-JP&page=${apiPage}`;
    if (currentMovieSource === 'search' && currentSearchQuery) {
        url += `&query=${encodeURIComponent(currentSearchQuery)}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} - ${errorData.status_message || response.statusText}`);
        }
        const data = await response.json();
        
        if(data.results && data.results.length > 0) {
            allLoadedMovies.push(...data.results);
            totalResults = data.total_results;
            totalApiPages = data.total_pages; // Update total pages
            apiPage++;
            displayMovies(); // Display movies
        } else {
            // If no movies found for search or category
            if (allLoadedMovies.length === 0) {
                if (movieListEl) movieListEl.innerHTML = '<p style="text-align: center; color: #777;" lang="ja">映画が見つかりませんでした。</p>';
                if (loadMoreBtn) loadMoreBtn.style.display = 'none'; // Hide Load More button
            }
        }
    } catch (error) {
        console.error('Fetch error:', error);
        if (movieListEl) movieListEl.innerHTML = '<p style="text-align: center; color: red;" lang="ja">映画情報の読み込みに失敗しました。APIキーが正しいか、ネットワーク接続を確認してください。</p>';
        if (loadMoreBtn) loadMoreBtn.style.display = 'none'; // Hide button on error
    } finally {
        isLoading = false; // Unset loading flag
        if (loadMoreBtn) loadMoreBtn.disabled = false; // Enable button
    }
}

/**
 * Fetches detailed information for a specific movie from the TMDB API.
 * @param {number} movieId - The ID of the movie
 * @returns {Promise<Object|null>} Movie detail object, or null on error
 */
async function fetchMovieDetails(movieId) {
    const endpoint = `/movie/${movieId}`;
    const url = `${TMDB_BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}&language=ja-JP`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch(error) {
        console.error(`Fetch movie details error for ID ${movieId}:`, error);
        return null; // Return null instead of displaying error message here
    }
}

/**
 * Fetches credits (including director) for a specific movie from the TMDB API.
 * @param {number} movieId - The ID of the movie
 * @returns {Promise<Object|null>} Credits object, or null on error
 */
async function fetchMovieCredits(movieId) {
    const endpoint = `/movie/${movieId}/credits`;
    const url = `${TMDB_BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}&language=ja-JP`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch(error) {
        console.error(`Fetch movie credits error for ID ${movieId}:`, error);
        return null;
    }
}

// =================================================================================
// Movie Display Related
// =================================================================================
/**
 * Creates a movie card DOM element based on movie data.
 * @param {Object} movie - Movie data object
 * @returns {HTMLElement} Created movie card DOM element
 */
function createMovieCard(movie) {
    const movieCard = document.createElement('div');
    movieCard.className = 'movie-card';
    movieCard.dataset.movieId = movie.id;

    // Fallback image if poster path is not available
    const posterPath = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : 'assets/images/no-poster.png';
    const releaseDate = movie.release_date ? movie.release_date : '未定';
    const voteAverage = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';

    movieCard.innerHTML = `
        <img src="${posterPath}" alt="${movie.title}" onerror="this.onerror=null;this.src='assets/images/no-poster.png';">
        <div class="movie-rating">${voteAverage}</div>
        <h3 class="movie-title" lang="ja">${movie.title}</h3>
        <p class="movie-release-date" lang="ja">公開日: ${releaseDate}</p>
    `;
    // Set click event listener on each movie card to open detail modal
    movieCard.addEventListener('click', () => openMovieDetailModal(movie.id));
    return movieCard;
}

/**
 * Displays movies based on the current displayCount from the allLoadedMovies array.
 * Also controls the visibility of the "Load More" button.
 */
function displayMovies() {
    // Clear existing content (on initial load or category/search switch)
    if (movieListEl) movieListEl.innerHTML = ''; 

    // Determine the number of movies to display
    const moviesToShow = allLoadedMovies.slice(0, displayCount);

    if (moviesToShow.length === 0 && allLoadedMovies.length === 0) {
        // If no movies on first load
        if (movieListEl) movieListEl.innerHTML = '<p style="text-align: center; color: #777;" lang="ja">映画が見つかりませんでした。</p>';
    } else {
        moviesToShow.forEach(movie => {
            const movieCard = createMovieCard(movie);
            if (movieListEl) movieListEl.appendChild(movieCard);
        });
    }
    
    // Control "Load More" button visibility
    // Hide if displayed movies count is greater than or equal to total results, or if API total pages are exceeded
    if (loadMoreBtn) { // Null check for loadMoreBtn
        if (moviesToShow.length >= totalResults || apiPage > totalApiPages) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
        }
    }
}

/**
 * Resets application state and reloads movies based on new criteria.
 * Used when switching categories or performing a search.
 */
function resetAndLoadMovies() {
    apiPage = 1; // Reset page number
    allLoadedMovies = []; // Clear loaded movie list
    displayCount = 8; // Reset display count to initial value
    totalResults = 0; // Reset total results
    totalApiPages = 1; // Reset total pages
    if (movieListEl) movieListEl.innerHTML = ''; // Clear movie list display area
    if (loadMoreBtn) loadMoreBtn.style.display = 'block'; // Show "Load More" button
    fetchMoviesFromApi(); // Fetch movies from API again
}

// =================================================================================
// Modal (Popup) Related
// =================================================================================
/**
 * Hides all modals and the overlay, and restores body scrolling.
 */
function closeModal() {
    if (modalOverlay) modalOverlay.classList.add('hidden'); // Hide overlay
    if (movieDetailModal) movieDetailModal.classList.add('hidden'); // Hide movie detail modal
    if (infoModal) infoModal.classList.add('hidden'); // Hide info modal
    document.body.style.overflow = ''; // Restore scrolling
}

/**
 * Opens the movie detail modal and displays movie information.
 * @param {number} movieId - The ID of the movie to display
 */
async function openMovieDetailModal(movieId) {
    // First, call the common close function to close all modals and ensure a clean state
    closeModal();

    const movie = await fetchMovieDetails(movieId);
    const credits = await fetchMovieCredits(movieId); // 監督情報を取得
    
    if (!movie) {
        if (movieDetailModal) { // Null check for movieDetailModal
            // Display message if movie detail fetch fails
            movieDetailModal.innerHTML = `
                <button class="close-modal-btn">&times;</button>
                <p style="text-align: center; color: #777;" lang="ja">映画詳細情報の読み込みに失敗しました。</p>
            `;
            // Show modal
            if (modalOverlay) modalOverlay.classList.remove('hidden');
            movieDetailModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            // Re-set event listener for close button as content is dynamically generated
            movieDetailModal.querySelector('.close-modal-btn')?.addEventListener('click', closeModal); // Optional chaining
        }
        return;
    }

    const director = credits && credits.crew ? (credits.crew.find(member => member.job === 'Director')?.name || '情報なし') : '情報なし';
    const genres = movie.genres && movie.genres.length > 0 ? movie.genres.map(g => g.name).join(', ') : '情報なし';

    // Fetch phobia information from the backend
    const phobiaReports = await getPhobiaInfoFromBackend(movieId); // ★ここで新しく作成するEdge Functionを呼び出す

    // Dynamically generate content for the movie detail modal
    // HTML structure is adjusted based on user requirements and specified order
    if (movieDetailModal) { // Null check for movieDetailModal
        movieDetailModal.innerHTML = `
            <button class="close-modal-btn">&times;</button>
            <div id="movie-detail-top-content">
                <div id="movie-detail-poster">
                    <img src="${movie.poster_path ? IMAGE_BASE_URL + movie.poster_path : 'assets/images/no-poster.png'}" alt="${movie.title}" onerror="this.onerror=null;this.src='assets/images/no-poster.png';">
                </div>
                <div id="movie-detail-info">
                    <h2 lang="ja">${movie.title}</h2>
                    <p lang="ja"><strong>あらすじ:</strong> ${movie.overview || 'あらすじ情報がありません。'}</p>
                    <p lang="ja"><strong>監督:</strong> ${director}</p>
                    <p lang="ja"><strong>上映時間:</strong> ${movie.runtime ? movie.runtime + '分' : '情報なし'}</p>
                    <p lang="ja"><strong>ジャンル:</strong> ${genres}</p>
                </div>
            </div>
            <div style="border-top: 1px solid #eee; margin: 20px 0;"></div> <!-- Separator line -->
            <div id="phobia-section">
                <h3 lang="ja">報告されている恐怖要素</h3>
                <div id="phobia-reports-list">
                    ${generatePhobiaReportsHTML(phobiaReports)}
                </div>
                <div style="border-top: 1px solid #eee; margin: 20px 0;"></div> <!-- Separator line -->
                <form id="phobia-form" data-movie-id="${movieId}">
                    <h3 lang="ja">恐怖要素を報告する</h3>
                    <div id="phobia-select-container">
                        ${generatePhobiaCheckboxes()}
                    </div>
                    <input type="text" id="phobia-other-text" placeholder="「その他」を選択した場合、内容を記入" lang="ja">
                    <textarea id="phobia-details-text" placeholder="詳細（任意）：どのシーンで、どのような描写だったかなど" lang="ja"></textarea>
                    <input type="text" id="phobia-time-text" placeholder="出現時間（任意）：例) 35:10頃〜" lang="ja">
                    <div class="form-buttons-container"> <!-- Flex container for buttons -->
                        <button type="submit" lang="ja">報告する</button>
                        <button id="share-x-button" class="btn share-x-btn" data-movie-id="${movieId}" data-movie-title="${movie.title}">
                            𝕏
                        </button>
                        <!-- AI診断ボタンをここに追加 -->
                        <button id="ai-diagnosis-button" class="btn ai-diagnosis-btn" data-movie-id="${movieId}" data-movie-title="${movie.title}">
                            AI診断
                        </button>
                    </div>
                    <p id="form-message" style="margin-top: 10px;"></p>
                </form>
            </div>
        `;

        // Show modal
        if (modalOverlay) modalOverlay.classList.remove('hidden'); // Show overlay
        movieDetailModal.classList.remove('hidden'); // Show movie detail modal
        document.body.style.overflow = 'hidden'; // Disable background scrolling

        // Re-set event listeners for close button, form, and X share button
        movieDetailModal.querySelector('.close-modal-btn')?.addEventListener('click', closeModal); // Optional chaining
        document.getElementById('phobia-form')?.addEventListener('submit', handlePhobiaFormSubmit); // Optional chaining
        setupPhobiaAccordion(); // Setup accordion functionality
        
        // ★★★ Xシェアボタンのイベントリスナーを設定 ★★★
        document.getElementById('share-x-button')?.addEventListener('click', handleShareX); // Optional chaining
        // ★★★ AI診断ボタンのイベントリスナーを設定 ★★★
        document.getElementById('ai-diagnosis-button')?.addEventListener('click', handleAiDiagnosisClick); // Optional chaining
    }
}

/**
 * Opens the info modal and displays the specified title and content.
 * @param {string} title - The title to display in the modal
 * @param {string} content - The HTML content to display in the modal
 * @param {function} [onCloseCallback=null] - Optional: Callback function to execute when the modal is closed.
 */
function openInfoModal(title, content, onCloseCallback = null) {
    closeModal();

    if (infoModal) { // Null check for infoModal
        document.getElementById('info-modal-title').innerText = title;
        document.getElementById('info-modal-body').innerHTML = content;
        
        if (modalOverlay) modalOverlay.classList.remove('hidden');
        infoModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        infoModal.querySelector('.close-modal-btn')?.addEventListener('click', () => { // Optional chaining
            closeModal();
            if (onCloseCallback) {
                onCloseCallback();
            }
        });
    }
}


// =================================================================================
// Phobia Element Submission & Display Related
// =================================================================================
/**
 * Fetches phobia element information for a specific movie from the backend.
 * @param {number} movieId - The ID of the movie
 * @returns {Promise<Object>} Phobia report data
 */
async function getPhobiaInfoFromBackend(movieId) {
    console.log(`[Frontend] Fetching phobia info from backend for movie ID: ${movieId}`);
    
    try {
        const response = await fetch(`${GET_PHOBIA_URL}?movieId=${movieId}`); 
        if (!response.ok) {
            // エラーレスポンスのボディをパースして、詳細なエラーメッセージを取得
            const errorData = await response.json();
            console.error(`[Frontend] Failed to fetch phobia reports (HTTP Status: ${response.status}):`, errorData); // より詳細なログ
            throw new Error(`Failed to fetch phobia reports: ${errorData.error || '不明なエラー'}`);
        }
        const data = await response.json();
        console.log("[Frontend] Fetched raw phobia data from backend:", data); // ★追加: ここで生データをログに出力
        return data.reports || {}; 
    } catch (error) { 
        console.error('[Frontend] Error fetching phobia info in frontend:', error.message); // より詳細なログ
        return {}; // エラー時は空のオブジェクトを返す
    }
}

/**
 * Generates HTML based on phobia report data.
 * Displays the number of posts for each phobia element as a badge, and expands details on click.
 * @param {Object} reports - Phobia report data
 * @returns {string} Generated HTML string
 */
function generatePhobiaReportsHTML(reports) {
    if (!reports || Object.keys(reports).length === 0) {
        return '<p style="text-align: center; color: #777;" lang="ja">まだ恐怖要素の報告がありません。</p>';
    }
    let html = '';
    // Sort phobia keys for consistent order
    const sortedPhobias = Object.keys(reports).sort(); 
    for (const phobia of sortedPhobias) {
        const details = reports[phobia];
        html += `
            <div class="phobia-item" data-phobia="${phobia}">
                <span lang="ja">${phobia} <span class="phobia-badge">x ${details.length}</span></span>
                <span class="accordion-icon">▼</span>
            </div>
            <div class="phobia-details" id="details-${phobia}" style="display: none;">
                ${details.map(d => `
                    <div class="phobia-report-entry">
                        <p lang="ja"><strong>詳細:</strong> ${d.detail || 'なし'}</p>
                        <p lang="ja"><strong>時間:</strong> ${d.time || '指定なし'}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
    return html;
}

/**
 * Generates phobia element checkbox form.
 * @returns {string} HTML string of checkboxes
 */
function generatePhobiaCheckboxes() {
    return PHOBIA_ELEMENTS.map(phobia => `
        <label lang="ja">
            <input type="checkbox" name="phobia" value="${phobia}"> ${phobia}
        </label>
    `).join('');
}

/**
 * Sets up accordion functionality (expand/collapse) for phobia reports.
 */
function setupPhobiaAccordion() {
    document.querySelectorAll('.phobia-item').forEach(item => {
        item.addEventListener('click', () => {
            const phobiaName = item.dataset.phobia;
            const detailsEl = document.getElementById(`details-${phobiaName}`);
            const icon = item.querySelector('.accordion-icon');
            if (detailsEl?.style.display === 'block') { // Optional chaining for detailsEl
                if (detailsEl) detailsEl.style.display = 'none';
                if (icon) icon.textContent = '▼';
            } else {
                if (detailsEl) detailsEl.style.display = 'block';
                if (icon) icon.textContent = '▲';
            }
        });
    });
}

/**
 * Handles the submission of the phobia element submission form.
 * Includes moderation functionality with URL filtering.
 * @param {Event} event - Form submission event
 */
async function handlePhobiaFormSubmit(event) {
    event.preventDefault(); // Prevent default form submission

    const form = event.target;
    const movieId = form.dataset.movieId;
    const selectedPhobias = Array.from(form.querySelectorAll('input[name="phobia"]:checked')).map(cb => cb.value);
    
    // `as HTMLInputElement` と `as HTMLTextAreaElement` を削除し、より安全な値の取得方法に変更
    const otherText = (document.getElementById('phobia-other-text')?.value || '').trim();
    const detailsText = (document.getElementById('phobia-details-text')?.value || '').trim();
    const timeText = (document.getElementById('phobia-time-text')?.value || '').trim();
    
    const formMessage = document.getElementById('form-message');

    // URL filtering for submission content (moderation feature)
    const hasUrl = (text) => /(https?:\/\/[^\s]+)/g.test(text || ''); // null/undefinedチェックを追加しました

    if (hasUrl(otherText) || hasUrl(detailsText) || hasUrl(timeText)) { // ★修正: timeText もチェック対象に含める
        if (formMessage) {
            formMessage.style.color = 'red';
            formMessage.innerText = '報告内容にURLが含まれています。URLの報告はブロックされます。'; // 「報告」に統一
        }
        console.warn('Moderation Alert: URL detected in submission for movie ID:', movieId);
        return; // Block submission
    }

    if (selectedPhobias.length === 0 && !otherText) {
        if (formMessage) {
            formMessage.style.color = 'red';
            formMessage.innerText = '恐怖要素を少なくとも1つ選択するか、「その他」に内容を記入してください。';
        }
        return;
    }

    const payload = {
        movieId: movieId, // Edge Functionでタイトルに変換するため、IDを送信
        phobias: selectedPhobias,
        otherPhobia: otherText,
        details: detailsText,
        time: timeText
    };

    try {
        console.log('Submitting phobia report to backend...');
        const response = await fetch(SUBMIT_PHOBIA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`報告失敗: ${errorData.error || '不明なエラー'}`); // 「報告」に統一
        }

        if (formMessage) formMessage.innerText = ''; // フォームメッセージをクリア
        form.reset(); // フォームをリセット
        // `as HTMLInputElement` を削除し、より安全な値の取得方法に変更
        const phobiaOtherTextEl = document.getElementById('phobia-other-text');
        if (phobiaOtherTextEl instanceof HTMLInputElement) { // 型ガードで安全にアクセス
            phobiaOtherTextEl.value = ''; // 「その他」テキストフィールドもリセット
        }

        // 報告成功ポップアップを表示
        openInfoModal(
            '報告完了',
            '<p style="text-align: center; color: #333; font-size: 1.1em;">恐怖要素の報告、ありがとうございました！<br>この情報はサイトの改善に役立てられます。</p>',
            () => { // ポップアップが閉じられた後に実行するコールバック
                openMovieDetailModal(movieId); // 最新の情報で映画詳細モーダルを再表示
            }
        );

    } catch (error) {
        console.error('Phobia submission error:', error);
        if (formMessage) {
            formMessage.style.color = 'red';
            formMessage.innerText = `報告に失敗しました。時間をおいて再度お試しください。(${error.message})`; // 「報告」に統一
        }
    }
}

// =================================================================================
// X (旧 Twitter) シェア機能
// =================================================================================
/**
 * Xシェアボタンのクリックイベントを処理する。
 * 映画タイトルを含んだシェアテキストを生成し、Xのシェアウィンドウを開く。
 * @param {Event} event - クリックイベント
 */
function handleShareX(event) {
    // `event.target` の型を HTMLElement に絞り込み、`closest` メソッドの存在を保証
    const shareButton = (event.target instanceof HTMLElement) ? event.target.closest('#share-x-button') : null;
    if (!shareButton) return; // ボタンが見つからなければ何もしない

    // `shareButton` が HTMLElement であることを確認して `dataset` にアクセス
    const movieTitle = (shareButton instanceof HTMLElement) ? (shareButton.dataset.movieTitle || '映画') : '映画';
    
    // シェアするテキストを生成
    const shareText = `『${movieTitle}』の恐怖要素を「フォビアムービーサーチ」でチェックしました！\n\nあなたも映画を安心して楽しむために活用しませんか？\n\n#フォビアムービーサーチ`;
    
    // 現在のサイトのURLを取得 (デプロイ環境ではそのURLになる)
    const currentUrl = window.location.href.split('#')[0]; // URLからハッシュ部分を除去
    
    // XシェアURLを構築
    const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(currentUrl)}`;
    
    // 新しいウィンドウでXシェアページを開く
    window.open(xShareUrl, '_blank', 'width=600,height=400');
}

// =================================================================================
// AI診断ボタンのプレースホルダー機能
// =================================================================================
/**
 * AI診断ボタンのクリックイベントを処理するプレースホルダー関数。
 * 現時点では情報モーダルを表示する。
 * @param {Event} event - クリックイベント
 */
function handleAiDiagnosisClick(event) {
    // データ属性から映画タイトルを取得（もし必要なら）
    const aiDiagnosisButton = (event.target instanceof HTMLElement) ? event.target.closest('#ai-diagnosis-button') : null;
    const movieTitle = (aiDiagnosisButton instanceof HTMLElement) ? (aiDiagnosisButton.dataset.movieTitle || 'この映画') : 'この映画';

    openInfoModal(
        'AI診断',
        `<p style="text-align: center; color: #333; font-size: 1.1em;">『${movieTitle}』のAI診断機能は現在開発中です。<br>しばらくお待ちください。</p>`
    );
}


// =================================================================================
// Event Listener Setup
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    resetAndLoadMovies(); // Load initial movies on page load

    // Click event for category tabs
    if (categoryTabs) { // Null check
        categoryTabs.addEventListener('click', (e) => {
            if (e.target instanceof HTMLButtonElement && !isLoading) { // If a button is clicked and not loading, type check
                // Remove 'active' class from all tabs
                categoryTabs.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
                // Add 'active' class to the clicked tab
                e.target.classList.add('active');
                
                currentMovieSource = 'category'; // Set source to category
                currentCategory = e.target.dataset.category || 'now_playing'; // Update category, provide fallback
                currentSearchQuery = ''; // Clear search query
                if (searchInput) searchInput.value = ''; // Clear search input field
                resetAndLoadMovies(); // Reset and load movie list
            }
        });
    }

    // Click event for "Load More" button
    if (loadMoreBtn) { // Null check
        loadMoreBtn.addEventListener('click', async () => { 
            if (isLoading) return; // Do nothing if loading

            displayCount += 8; // Increase display count by 8

            // If current display count is less than loaded movies AND API total pages not exceeded
            if (displayCount > allLoadedMovies.length && apiPage <= totalApiPages) {
                await fetchMoviesFromApi(); // Fetch additional movies from API
            } else {
                displayMovies(); // Display loaded movies with increased count
            }
        });
    }

    // Click event for search button
    if (searchButton && searchInput) { // Null check
        searchButton.addEventListener('click', () => {
            const query = searchInput.value.trim(); // Get search query
            if (query && !isLoading) { // If query exists and not loading
                currentMovieSource = 'search'; // Set source to search
                currentSearchQuery = query; // Update search query
                resetAndLoadMovies(); // Reset and load movie list
            }
        });
    }

    // Keypress event for search input (Enter key)
    if (searchInput && searchButton) { // Null check
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchButton.click(); // Click search button
            }
        });
    }

    // Click event for modal overlay (closes only when overlay itself is clicked)
    if (modalOverlay) { // Null check
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal(); // Close modal
            }
        });
    }

    // ★★★ Footer Popup Content (User-specified content stored here) ★★★
    const INFO_CONTENT = {
        'about': { title: 'サイト説明', body: `「フォビアムービーサーチ」は、フォビア（恐怖症）を持つ方が映画を選ぶ際に、 事前に恐怖要素を確認できるサイトです。<br>様々な恐怖症（高所恐怖症、閉所恐怖症、蜘蛛恐怖症など）を持つ方が、 安心して映画を楽しめるよう、映画に含まれる可能性のある恐怖要素を表示しています。<br>このサイトは皆様からの情報提供によって成り立っています。映画の恐怖要素について 知っていることがあれば、ぜひ情報を追加してください。<br><br>※注意事項：<br>・日本で公開されていない海外の映画も含まれている場合があります。<br>・日本の公開日と海外の公開日が混在しているため、公開時期の表記に重複やズレが生じることがあります。<br>・恐怖要素の情報はユーザー報告を中心に構成しているため、内容に差異があることがあります。` },
        'disclaimer': { title: '免責事項', body: `当サイトに掲載されている恐怖要素の情報は、ユーザーからの報告に基づいています。 情報の正確性は保証できませんので、あくまで参考程度にご利用ください。<br>・報告内容は運営の判断で予告なく修正・削除する場合があります。<br>・映画の恐怖要素を説明する過程で、ネタバレを含む可能性があります。 映画の内容を知りたくない方はご注意ください。<br>・当サイトの利用によって生じたいかなる損害についても、運営者は責任を負いません。` },
        'privacy': { title: 'プライバシーポリシー', body: `1. 収集する情報<br>当サイトでは、サイト改善のために匿名の利用統計情報を収集することがあります。 また、報告機能を利用する際に入力された情報を保存します。<br><br>2. 情報の利用目的<br>収集した情報は、サイトの改善、コンテンツの充実、およびユーザー体験の向上のために利用します。<br><br>3. 第三者への提供<br>法令に基づく場合を除き、収集した個人情報を第三者に提供することはありません。<br><br>4. Cookieの使用<br>当サイトでは、ユーザー体験向上のためにCookieを使用しています。 ブラウザの設定でCookieを無効にすることも可能です。<br><br>5. 広告について<br>当サイトではGoogle AdSenseを利用しており、 ユーザーの興味に基づいた広告が表示されることがあります。` },
        'guideline': { title: '報告ガイドライン', body: `<h3>報告の目的</h3>\n恐怖症を持つ方が安心して映画を選べるよう、正確で役立つ情報の提供にご協力ください。<br><br><h3>報告時の注意点</h3>\n・実際に視聴した映画についてのみ報告してください。<br>・恐怖要素の詳細は具体的に記入してください（例：「高所シーンあり」ではなく「30分頃、高いビルの屋上からの視点で撮影されたシーンが約2分間続く」など）。<br>・ネタバレになる可能性がある場合は、その旨を明記してください。<br>・出現時間は分かる範囲で記入してください（任意）。<br><br><h3>禁止事項</h3>\n・虚偽の情報の報告<br>・映画の内容と関係のない報告<br>・誹謗中傷や差別的な表現を含む報告<br>・著作権を侵害する内容の報告<br>・広告や宣伝目的の報告` },
        'faq': { title: 'FAQ', body: `<h3>Q: このサイトはどのように使えばいいですか？</h3>\nA: 映画のタイトルを検索するか、「公開予定の映画」「上映中の映画」などのカテゴリから映画を選び、詳細ページで恐怖要素を確認できます。<br><h3>Q: 恐怖要素の情報はどこから来ていますか？</h3>\nA: サイト利用者からの報告情報です。より多くの方の協力で情報の質と量を高めていきます。<br><h3>Q: 映画の恐怖要素情報を追加するにはどうすればいいですか？</h3>\nA: 映画の詳細ページにある「恐怖要素を報告する」から報告できます。<br><h3>Q: 間違った情報を見つけた場合はどうすればいいですか？</h3>\nA: お問い合わせフォームから報告してください。確認の上、修正対応いたします。<br><h3>Q: 探している映画が見つからない場合は？</h3>\nA: 正確なタイトルで検索してみてください。それでも見つからない場合は、TMDBのデータベースにまだ登録されていない可能性があります。` }
    };

    // Event listener for Home link
    const homeLink = document.getElementById('home-link');
    if (homeLink) { // Null check
        homeLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            window.scrollTo({ top: 0, behavior: 'smooth' }); 
            closeModal(); // Close modal when returning home
        });
    }

    // Event listeners for footer info links
    document.getElementById('about-link')?.addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.about.title, INFO_CONTENT.about.body); }); // Optional chaining
    document.getElementById('disclaimer-link')?.addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.disclaimer.title, INFO_CONTENT.disclaimer.body); }); // Optional chaining
    document.getElementById('privacy-link')?.addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.privacy.title, INFO_CONTENT.privacy.body); }); // Optional chaining
    document.getElementById('guideline-link')?.addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.guideline.title, INFO_CONTENT.guideline.body); }); // Optional chaining
    document.getElementById('faq-link')?.addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.faq.title, INFO_CONTENT.faq.body); }); // Optional chaining

    // Feature buttons (using openInfoModal as per user request)
    document.getElementById('phobia-directors-btn')?.addEventListener('click', () => { // Optional chaining
        openInfoModal('フォビアディレクター', '<p lang="ja" style="text-align: center;">恐怖要素の高い監督に関する情報は現在集計中です。しばらくお待ちください。</p>'); 
    });
    document.getElementById('legend-phobia-btn')?.addEventListener('click', () => { // Optional chaining
        openInfoModal('レジェンドフォビアムービー', '<p lang="ja" style="text-align: center;">恐怖要素が10個以上あるレジェンド映画に関する情報は現在集計中です。しばらくお待ちください。</p>'); 
    });
});
