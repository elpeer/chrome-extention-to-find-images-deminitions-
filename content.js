console.log('Image Scanner Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scanImages') {
        startScan();
        sendResponse({ status: 'Scan started' });
    }
});

async function startScan() {
    reportStatus('Scanning for images...');

    const images = [];

    // 1. Scan <img> tags
    const imgTags = document.querySelectorAll('img');
    imgTags.forEach(img => {
        if (isVisible(img)) {
            images.push({
                element: img,
                type: 'img',
                src: img.src,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                displayWidth: img.width,
                displayHeight: img.height
            });
        }
    });

    // 2. Scan background images
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.startsWith('url')) {
            // Extract URL
            const urlMatch = style.backgroundImage.match(/url\(["']?([^"']*)["']?\)/);
            if (urlMatch && isVisible(el)) {
                images.push({
                    element: el,
                    type: 'background',
                    src: urlMatch[1],
                    width: el.offsetWidth, // Approximate for bg
                    height: el.offsetHeight,
                    displayWidth: el.offsetWidth,
                    displayHeight: el.offsetHeight
                });
            }
        }
    });

    reportStatus(`Found ${images.length} images. Generating screenshots...`);

    // 3. Process images: Screenshot & Prepare Data
    const excelData = [];

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Images');

    worksheet.columns = [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Source URL', key: 'src', width: 40 },
        { header: 'Dimensions (Natural)', key: 'dimensions', width: 20 },
        { header: 'Display Size', key: 'displaySize', width: 20 },
        { header: 'Screenshot', key: 'screenshot', width: 20 }
    ];

    for (let i = 0; i < images.length; i++) {
        const item = images[i];
        reportStatus(`Processing image ${i + 1}/${images.length}...`);

        try {
            // Capture Screenshot of the element
            // Use html2canvas
            const canvas = await html2canvas(item.element, {
                useCORS: true,
                logging: false,
                allowTaint: true // This might cause security errors for export if tainted
            });

            const base64Image = canvas.toDataURL('image/png');

            // Add row
            const row = worksheet.addRow({
                type: item.type,
                src: item.src,
                dimensions: `${item.width}x${item.height}`,
                displaySize: `${item.displayWidth}x${item.displayHeight}`,
                screenshot: '' // Placeholder
            });

            // Add Image to Excel
            // ExcelJS needs the base64 without prefix
            const imageId = workbook.addImage({
                base64: base64Image,
                extension: 'png',
            });

            // Embed image in the "Screenshot" column (E)
            worksheet.addImage(imageId, {
                tl: { col: 4, row: row.number - 1 }, // 0-indexed col 4 = E
                ext: { width: 100, height: 100 } // Thumbnail size
            });

            // Set row height to accommodate image
            row.height = 80;

        } catch (e) {
            console.error('Error capturing image:', e);
            worksheet.addRow({
                type: item.type,
                src: item.src,
                dimensions: `${item.width}x${item.height}`,
                displaySize: `${item.displayWidth}x${item.displayHeight}`,
                screenshot: 'Error capturing'
            });
        }
    }

    reportStatus('Finalizing Excel file...');

    // Write and Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `images_scan_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    reportStatus('Done! Scan finished.');
}

function isVisible(elem) {
    if (!(elem instanceof Element)) return false;
    const style = getComputedStyle(elem);
    if (style.display === 'none') return false;
    if (style.visibility !== 'visible') return false;
    if (style.opacity === '0') return false;
    if (elem.offsetWidth + elem.offsetHeight + elem.getClientRects().length === 0) return false;
    return true;
}

function reportStatus(msg) {
    chrome.runtime.sendMessage({ action: 'updateStatus', status: msg });
}
