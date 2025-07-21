// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Configure CMaps for proper character decoding
pdfjsLib.GlobalWorkerOptions.cMapUrl = './cmaps/';
pdfjsLib.GlobalWorkerOptions.cMapPacked = true;

// DOM Helper Functions
const DOMHelpers = {
    createElement(tag, className = '', attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        return element;
    },
    clearElement(element) {
        element.innerHTML = '';
    },
    
    setStyles(element, styles) {
        Object.entries(styles).forEach(([property, value]) => {
            element.style[property] = value;
        });
    }
};

// Text-Only PDF Reader
class TextOnlyPDFReader {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.5;
        
        this.container = document.getElementById('pdfContainer');
        this.textContainer = null;
        
        this.initEventListeners();
        this.initDarkMode();
        this.updateUI();
    }
    
    initEventListeners() {
        // File input
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.loadPDF(e.target.files[0]);
        });
        
        // Navigation buttons
        document.getElementById('prevPage').addEventListener('click', () => {
            this.navigateToPage(this.pageNum - 1);
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            this.navigateToPage(this.pageNum + 1);
        });
        
        // Text selection logging
        document.addEventListener('mouseup', () => {
            const selectedText = this.getSelectedText();
            if (selectedText) {
                console.log('Selected text:', selectedText);
            }
        });
        
        // Dark mode toggle
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            this.toggleDarkMode();
        });
    }
    
    async loadPDF(file) {
        if (!file) return;
        
        try {
            const arrayBuffer = await this.fileToArrayBuffer(file);
            const typedArray = new Uint8Array(arrayBuffer);
            
            // Configure document loading with better text extraction options
            const loadingTask = pdfjsLib.getDocument({
                data: typedArray,
                disableFontFace: false,
                useSystemFonts: true
            });
            
            this.pdfDoc = await loadingTask.promise;
            this.pageNum = 1;
            
            await this.renderCurrentPage();
            this.updateUI();
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF file. Please try another file.');
        }
    }
    
    fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
    
    async renderCurrentPage() {
        if (!this.pdfDoc || this.pageRendering) return;
        
        this.pageRendering = true;
        
        try {
            const page = await this.pdfDoc.getPage(this.pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            // Clear previous content
            DOMHelpers.clearElement(this.container);
            
            // Create enhanced text container with custom styling
            const pageWrapper = DOMHelpers.createElement('div', 'text-page-wrapper');
            this.textContainer = DOMHelpers.createElement('div', 'text-page zoom-in');
            
            // Add page indicator
            const pageIndicator = DOMHelpers.createElement('div', 'page-indicator');
            pageIndicator.textContent = `Página ${this.pageNum}`;
            
            // Add particles container
            const particlesContainer = DOMHelpers.createElement('div', 'text-page-particles');
            this.createParticles(particlesContainer);
            
            DOMHelpers.setStyles(this.textContainer, {
                position: 'relative',
                width: viewport.width + 'px',
                height: viewport.height + 'px',
                overflow: 'hidden',
                zIndex: '2'
            });
            
            this.textContainer.appendChild(pageIndicator);
            this.textContainer.appendChild(particlesContainer);
            pageWrapper.appendChild(this.textContainer);
            
            // Render text content
            await this.renderTextContent(page, viewport);
            
            this.container.appendChild(pageWrapper);
            
        } catch (error) {
            console.error('Error rendering page:', error);
        } finally {
            this.pageRendering = false;
            
            // Handle pending page render
            if (this.pageNumPending !== null) {
                const pendingPage = this.pageNumPending;
                this.pageNumPending = null;
                this.navigateToPage(pendingPage);
            }
        }
    }
    
    async renderTextContent(page, viewport) {
        try {
            // Use enhanced text extraction options for better character decoding
            const textContent = await page.getTextContent({
                normalizeWhitespace: true,
                disableCombineTextItems: false,
            });
            
            // Process all text items with character mapping
            const processedItems = textContent.items.map(item => {
                let s = item.str;
                // mapeamentos mais comuns:
                s = s.replace(/\u2013/g, "–");  // en dash
                s = s.replace(/\u2014/g, "—");  // em dash
                s = s.replace(/\u2012/g, "‑");  // figure dash
                // outros remaps específicos de PDFs que você encontrar…
                return { ...item, str: s };
            });
            
            // Log the processed text for debugging
            const text = processedItems.map(item => item.str).join("");
            console.log(text);
            
            processedItems.forEach((textItem) => {
                // Calculate text position using PDF.js transformation
                const tx = pdfjsLib.Util.transform(
                    pdfjsLib.Util.transform(viewport.transform, textItem.transform),
                    [1, 0, 0, -1, 0, 0]
                );
                
                const fontSize = tx[0];
                const textSpan = DOMHelpers.createElement('span', 'text-item');
                textSpan.textContent = textItem.str;
                
                DOMHelpers.setStyles(textSpan, {
                    position: 'absolute',
                    left: tx[4] + 'px',
                    top: (tx[5] - fontSize) + 'px',
                    fontSize: fontSize + 'px',
                    fontFamily: 'serif',
                    color: '#333',
                    whiteSpace: 'pre',
                    cursor: 'text',
                    transformOrigin: '0% 0%',
                    userSelect: 'text',
                    zIndex: '3'
                });
                
                this.textContainer.appendChild(textSpan);
            });
            
        } catch (error) {
            console.error('Error rendering text content:', error);
        }
    }
    
    navigateToPage(pageNum) {
        if (!this.pdfDoc) return;
        
        // Validate page number
        if (pageNum < 1 || pageNum > this.pdfDoc.numPages) return;
        
        if (this.pageRendering) {
            this.pageNumPending = pageNum;
            return;
        }
        
        this.pageNum = pageNum;
        this.renderCurrentPage();
        this.updateUI();
    }
    
    getSelectedText() {
        const selection = window.getSelection();
        return selection.toString().trim();
    }
    
    updateUI() {
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (this.pdfDoc) {
            pageInfo.textContent = `Page ${this.pageNum} of ${this.pdfDoc.numPages}`;
            prevBtn.disabled = this.pageNum <= 1;
            nextBtn.disabled = this.pageNum >= this.pdfDoc.numPages;
        } else {
            pageInfo.textContent = 'No PDF loaded';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        }
    }
    
    initDarkMode() {
        // Check for saved dark mode preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        if (savedDarkMode) {
            document.body.classList.add('dark-mode');
        }
        // Always update button to show correct icon
        this.updateDarkModeButton();
    }
    
    toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        
        // Save preference
        localStorage.setItem('darkMode', isDarkMode);
        
        this.updateDarkModeButton();
    }
    
    updateDarkModeButton() {
        const darkModeBtn = document.getElementById('darkModeToggle');
        const isDarkMode = document.body.classList.contains('dark-mode');
        darkModeBtn.textContent = isDarkMode ? '☀️' : '🌙';
    }
    
    createParticles(container) {
        // Create floating particles for visual effect
        for (let i = 0; i < 8; i++) {
            const particle = DOMHelpers.createElement('div', 'particle');
            DOMHelpers.setStyles(particle, {
                left: Math.random() * 100 + '%',
                animationDelay: Math.random() * 6 + 's',
                animationDuration: (4 + Math.random() * 4) + 's'
            });
            container.appendChild(particle);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TextOnlyPDFReader();
});