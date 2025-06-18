// =================================================================================
// Initial Setup and DOM Element Acquisition
// =================================================================================
// ★★★ Please reconfirm your API key! ★★★
// Please replace 'YOUR_TMDB_API_KEY' below with your own API key.
// If this is not correct, no movie information will be displayed.
const TMDB_API_KEY = '9c5b6fe18f36543b858effdaf87e44e0'; // Replace with your TMDB API key

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Supabase Edge Function Endpoints (Change according to your environment)
// ※These URLs need to be set correctly upon actual deployment.
// デプロイしたSupabase Edge Functionの正確なURLに置き換えてください
const SUBMIT_PHOBIA_URL = 'https://yzkmduhebhwkkywhvakr.supabase.co/functions/v1/submit-phobia-report'; // 末尾の /submit は不要です
const GET_PHOBIA_URL = 'YOUR_SUPABASE_EDGE_FUNCTION_URL/get-by-movie'; // Assumed to return dummy data
const GET_FEATURE_URL = 'YOUR_SUPABASE_EDGE_FUNCTION_URL/features'; // Assumed to return dummy data

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
        loadMoreBtn.style.display = 'none';
        return;
    }
    isLoading = true; // Set loading flag
    loadMoreBtn.disabled = true; // Disable button to prevent rapid clicks

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
                movieListEl.innerHTML = '<p style="text-align: center; color: #777;" lang="ja">該当する映画が見つかりませんでした。</p>';
                loadMoreBtn.style.display = 'none'; // Hide Load More button
            }
        }
    } catch (error) {
        console.error('Fetch error:', error);
        movieListEl.innerHTML = '<p style="text-align: center; color: red;" lang="ja">映画情報の読み込みに失敗しました。APIキーが正しいか、ネットワーク接続を確認してください。</p>';
        loadMoreBtn.style.display = 'none'; // Hide button on error
    } finally {
        isLoading = false; // Unset loading flag
        loadMoreBtn.disabled = false; // Enable button
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
    movieListEl.innerHTML = ''; 

    // Determine the number of movies to display
    const moviesToShow = allLoadedMovies.slice(0, displayCount);

    if (moviesToShow.length === 0 && allLoadedMovies.length === 0) {
        // If no movies on first load
        movieListEl.innerHTML = '<p style="text-align: center; color: #777;" lang="ja">映画が見つかりませんでした。</p>';
    } else {
        moviesToShow.forEach(movie => {
            const movieCard = createMovieCard(movie);
            movieListEl.appendChild(movieCard);
        });
    }
    
    // Control "Load More" button visibility
    // Hide if displayed movies count is greater than or equal to total results, or if API total pages are exceeded
    if (moviesToShow.length >= totalResults || apiPage > totalApiPages) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'block';
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
    movieListEl.innerHTML = ''; // Clear movie list display area
    loadMoreBtn.style.display = 'block'; // Show "Load More" button
    fetchMoviesFromApi(); // Fetch movies from API again
}

// =================================================================================
// Modal (Popup) Related
// =================================================================================
/**
 * Hides all modals and the overlay, and restores body scrolling.
 */
function closeModal() {
    modalOverlay.classList.add('hidden'); // Hide overlay
    movieDetailModal.classList.add('hidden'); // Hide movie detail modal
    infoModal.classList.add('hidden'); // Hide info modal
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
        // Display message if movie detail fetch fails
        movieDetailModal.innerHTML = `
            <button class="close-modal-btn">&times;</button>
            <p style="text-align: center; color: #777;" lang="ja">映画詳細情報の読み込みに失敗しました。</p>
        `;
        // Show modal
        modalOverlay.classList.remove('hidden');
        movieDetailModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // Re-set event listener for close button as content is dynamically generated
        movieDetailModal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        return;
    }

    const director = credits && credits.crew ? (credits.crew.find(member => member.job === 'Director')?.name || '情報なし') : '情報なし';
    const genres = movie.genres && movie.genres.length > 0 ? movie.genres.map(g => g.name).join(', ') : '情報なし';

    // Fetch phobia information from the backend (currently returns dummy data)
    const phobiaReports = await getPhobiaInfoFromBackend(movieId);

    // Dynamically generate content for the movie detail modal
    // HTML structure is adjusted based on user requirements and specified order
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
                <h3 lang="ja">恐怖要素を投稿する</h3>
                <div id="phobia-select-container">
                    ${generatePhobiaCheckboxes()}
                </div>
                <input type="text" id="phobia-other-text" placeholder="「その他」を選択した場合、内容を記入" lang="ja">
                <textarea id="phobia-details-text" placeholder="詳細（任意）：どのシーンで、どのような描写だったかなど" lang="ja"></textarea>
                <input type="text" id="phobia-time-text" placeholder="出現時間（任意）：例) 35:10頃〜" lang="ja">
                <button type="submit" lang="ja">投稿する</button>
                <p id="form-message" style="margin-top: 10px;"></p>
            </form>
        </div>
    `;

    // Show modal
    modalOverlay.classList.remove('hidden'); // Show overlay
    movieDetailModal.classList.remove('hidden'); // Show movie detail modal
    document.body.style.overflow = 'hidden'; // Disable background scrolling

    // Re-set event listeners for close button and form
    movieDetailModal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('phobia-form').addEventListener('submit', handlePhobiaFormSubmit);
    setupPhobiaAccordion(); // Setup accordion functionality
}

/**
 * Opens the info modal and displays the specified title and content.
 * @param {string} title - The title to display in the modal
 * @param {string} content - The HTML content to display in the modal
 */
function openInfoModal(title, content) {
    // First, call the common close function to close all modals and ensure a clean state
    closeModal();

    // Set content for the info modal
    document.getElementById('info-modal-title').innerText = title;
    document.getElementById('info-modal-body').innerHTML = content;
    
    // Show modal
    modalOverlay.classList.remove('hidden'); // Show overlay
    infoModal.classList.remove('hidden'); // Show info modal
    document.body.style.overflow = 'hidden'; // Disable background scrolling

    // Re-set event listener for close button
    infoModal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
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
    // ユーザーからの要望により、現在は空のオブジェクトを返します。
    // In reality, this would send movieId to GET_PHOBIA_URL to fetch information.
    console.log(`Fetching phobia info from backend for movie ID: ${movieId}`);
    // This is where you would actually call the Supabase Edge Function (GET_PHOBIA_URL)
    // try {
    //     const response = await fetch(`${GET_PHOBIA_URL}?movieId=${movieId}`);
    //     if (!response.ok) throw new Error('Failed to fetch phobia reports');
    //     const data = await response.json();
    //     return data.reports || {}; // Adjust according to Supabase response
    // } catch (error) {
    //     console.error('Error fetching phobia info:', error);
    //     return {}; // Return empty object on error
    // }

    // サンプルデータを削除し、空のオブジェクトを返します
    return {}; 
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
            if (detailsEl.style.display === 'block') {
                detailsEl.style.display = 'none';
                icon.textContent = '▼';
            } else {
                detailsEl.style.display = 'block';
                icon.textContent = '▲';
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
    const otherText = document.getElementById('phobia-other-text').value.trim();
    const detailsText = document.getElementById('phobia-details-text').value.trim();
    const timeText = document.getElementById('phobia-time-text').value.trim();
    const formMessage = document.getElementById('form-message');

    // URL filtering for submission content (moderation feature)
    const hasUrl = (text) => /(https?:\/\/[^\s]+)/g.test(text); // Add this line if hasUrl is not defined

    if (hasUrl(otherText) || hasUrl(detailsText) || hasUrl(timeText)) {
        formMessage.style.color = 'red';
        formMessage.innerText = '投稿内容にURLが含まれています。URLの投稿はブロックされます。';
        // Admin notification logic (currently only console output)
        console.warn('Moderation Alert: URL detected in submission for movie ID:', movieId);
        return; // Block submission
    }

    if (selectedPhobias.length === 0 && !otherText) {
        formMessage.style.color = 'red';
        formMessage.innerText = '恐怖要素を少なくとも1つ選択するか、「その他」に内容を記入してください。';
        return;
    }

    const payload = {
        movieId: movieId,
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
            // エラーの詳細メッセージをコンソールとフォームメッセージに表示
            throw new Error(`投稿失敗: ${errorData.error || '不明なエラー'}`); 
        }

        formMessage.style.color = 'green';
        formMessage.innerText = '恐怖要素が投稿されました！ご協力ありがとうございます。';
        form.reset(); // Reset form
        document.getElementById('phobia-other-text').value = ''; // Also reset "Other" text field
        // Re-open modal after submission to display updated report list
        await openMovieDetailModal(movieId); 

    } catch (error) {
        console.error('Phobia submission error:', error);
        formMessage.style.color = 'red';
        formMessage.innerText = `投稿に失敗しました。時間をおいて再度お試しください。(${error.message})`;
        // Consider admin notification logic for errors
    }
}

// =================================================================================
// Event Listener Setup
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    resetAndLoadMovies(); // Load initial movies on page load
});

// Click event for category tabs
categoryTabs.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && !isLoading) { // If a button is clicked and not loading
        // Remove 'active' class from all tabs
        categoryTabs.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
        // Add 'active' class to the clicked tab
        e.target.classList.add('active');
        
        currentMovieSource = 'category'; // Set source to category
        currentCategory = e.target.dataset.category; // Update category
        currentSearchQuery = ''; // Clear search query
        searchInput.value = ''; // Clear search input field
        resetAndLoadMovies(); // Reset and load movie list
    }
});

// Click event for "Load More" button
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

// Click event for search button
searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim(); // Get search query
    if (query && !isLoading) { // If query exists and not loading
        currentMovieSource = 'search'; // Set source to search
        currentSearchQuery = query; // Update search query
        resetAndLoadMovies(); // Reset and load movie list
    }
});

// Keypress event for search input (Enter key)
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchButton.click(); // Click search button
    }
});

// Click event for modal overlay (closes only when overlay itself is clicked)
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeModal(); // Close modal
    }
});

// ★★★ Footer Popup Content (User-specified content stored here) ★★★
const INFO_CONTENT = {
    'about': { title: 'サイト説明', body: `「フォビアムービーサーチ」は、フォビア（恐怖症）を持つ方が映画を選ぶ際に、 事前に恐怖要素を確認できるサイトです。<br>様々な恐怖症（高所恐怖症、閉所恐怖症、蜘蛛恐怖症など）を持つ方が、 安心して映画を楽しめるよう、映画に含まれる可能性のある恐怖要素を表示しています。<br>このサイトは皆様からの情報提供によって成り立っています。映画の恐怖要素について 知っていることがあれば、ぜひ情報を追加してください。<br><br>※注意事項：<br>・日本で公開されていない海外の映画も含まれている場合があります。<br>・日本の公開日と海外の公開日が混在しているため、公開時期の表記に重複やズレが生じることがあります。<br>・恐怖要素の情報はユーザー投稿を中心に構成しているため、内容に差異があることがあります。` },
    'disclaimer': { title: '免責事項', body: `当サイトに掲載されている恐怖要素の情報は、ユーザーからの投稿に基づいています。 情報の正確性は保証できませんので、あくまで参考程度にご利用ください。<br>・投稿内容は運営の判断で予告なく修正・削除する場合があります。<br>・映画の恐怖要素を説明する過程で、ネタバレを含む可能性があります。 映画の内容を知りたくない方はご注意ください。<br>・当サイトの利用によって生じたいかなる損害についても、運営者は責任を負いません。` },
    'privacy': { title: 'プライバシーポリシー', body: `1. 収集する情報<br>当サイトでは、サイト改善のために匿名の利用統計情報を収集することがあります。 また、投稿機能を利用する際に入力された情報を保存します。<br><br>2. 情報の利用目的<br>収集した情報は、サイトの改善、コンテンツの充実、およびユーザー体験の向上のために利用します。<br><br>3. 第三者への提供<br>法令に基づく場合を除き、収集した個人情報を第三者に提供することはありません。<br><br>4. Cookieの使用<br>当サイトでは、ユーザー体験向上のためにCookieを使用しています。 ブラウザの設定でCookieを無効にすることも可能です。<br><br>5. 広告について<br>当サイトではGoogle AdSenseを利用しており、 ユーザーの興味に基づいた広告が表示されることがあります。` },
    'guideline': { title: '投稿ガイドライン', body: `<h3>投稿の目的</h3>\n恐怖症を持つ方が安心して映画を選べるよう、正確で役立つ情報の提供にご協力ください。<br><br><h3>投稿時の注意点</h3>\n・実際に視聴した映画についてのみ投稿してください。<br>・恐怖要素の詳細は具体的に記入してください（例：「高所シーンあり」ではなく「30分頃、高いビルの屋上からの視点で撮影されたシーンが約2分間続く」など）。<br>・ネタバレになる可能性がある場合は、その旨を明記してください。<br>・出現時間は分かる範囲で記入してください（任意）。<br><br><h3>禁止事項</h3>\n・虚偽の情報の投稿<br>・映画の内容と関係のない投稿<br>・誹謗中傷や差別的な表現を含む投稿<br>・著作権を侵害する内容の投稿<br>・広告や宣伝目的の投稿` },
    'faq': { title: 'FAQ', body: `<h3>Q: このサイトはどのように使えばいいですか？</h3>\nA: 映画のタイトルを検索するか、「公開予定の映画」「上映中の映画」などのカテゴリから映画を選び、詳細ページで恐怖要素を確認できます。<br><h3>Q: 恐怖要素の情報はどこから来ていますか？</h3>\nA: サイト利用者からの投稿情報です。より多くの方の協力で情報の質と量を高めていきます。<br><h3>Q: 映画の恐怖要素情報を追加するにはどうすればいいですか？</h3>\nA: 映画の詳細ページにある「恐怖要素を投稿する」から投稿できます。<br><h3>Q: 間違った情報を見つけた場合はどうすればいいですか？</h3>\nA: お問い合わせフォームから報告してください。確認の上、修正対応いたします。<br><h3>Q: 探している映画が見つからない場合は？</h3>\nA: 正確なタイトルで検索してみてください。それでも見つからない場合は、TMDBのデータベースにまだ登録されていない可能性があります。` }
};

// Event listener for Home link
document.getElementById('home-link').addEventListener('click', (e) => { 
    e.preventDefault(); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
    closeModal(); // Close modal when returning home
});

// Event listeners for footer info links
document.getElementById('about-link').addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.about.title, INFO_CONTENT.about.body); });
document.getElementById('disclaimer-link').addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.disclaimer.title, INFO_CONTENT.disclaimer.body); });
document.getElementById('privacy-link').addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.privacy.title, INFO_CONTENT.privacy.body); });
document.getElementById('guideline-link').addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.guideline.title, INFO_CONTENT.guideline.body); });
document.getElementById('faq-link').addEventListener('click', (e) => { e.preventDefault(); openInfoModal(INFO_CONTENT.faq.title, INFO_CONTENT.faq.body); });

// Feature buttons (using openInfoModal as per user request)
document.getElementById('phobia-directors-btn').addEventListener('click', () => { 
    openInfoModal('フォビアディレクター', '<p lang="ja" style="text-align: center;">恐怖要素の高い監督に関する情報は現在集計中です。しばらくお待ちください。</p>'); 
});
document.getElementById('legend-phobia-btn').addEventListener('click', () => { 
    openInfoModal('レジェンドフォビアムービー', '<p lang="ja" style="text-align: center;">恐怖要素が10個以上あるレジェンド映画に関する情報は現在集計中です。しばらくお待ちください。</p>'); 
});
