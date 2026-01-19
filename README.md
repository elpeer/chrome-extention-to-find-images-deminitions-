# Chrome Extension: Image Scanner & Excel Export

A powerful Chrome extension that scans web pages for images, identifying their dimensions, sources, and context, and exports a comprehensive Excel report.

## Features
- **Smart Scanning**: Detects both `<img>` tags and CSS `background-image` elements.
- **Deduplication**: Automatically groups similar images (e.g., within sliders or galleries) to avoid clutter, keeping only unique size variants per section.
- **Context Awareness**: Captures screenshots of the *parent section* to show where the image is located on the page.
- **Excel Export**: Generates a detailed `.xlsx` file including:
  - Page Title & URL
  - Section Name & Screenshot
  - Image Source & Dimensions (Natural vs Display)
  - Image Thumbnail
- **Optimized Performance**: Uses JPEG compression and resizing to keep Excel file sizes manageable (typically < 5MB).

## Installation
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer Mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select the project folder.

## Usage
1. Navigate to any web page you want to analyze.
2. Click the extension icon (blue magnifying glass) in the toolbar.
3. Click **Scan & Export**.
4. Wait for the process to complete. The Excel file will download automatically.

## Technologies
- Manifest V3
- [html2canvas](https://html2canvas.hertzen.com/) - For capturing screenshots.
- [ExcelJS](https://github.com/exceljs/exceljs) - For generating rich Excel files with images.
