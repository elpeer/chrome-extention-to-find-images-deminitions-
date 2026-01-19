console.log('Image Scanner Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scanImages') {
        startScan();
        sendResponse({ status: 'Scan started' });
    }
});

async function startScan() {
    reportStatus('Scanning for images...');

    // Preliminary list of all valid images
    const rawImages = [];

    // 1. Scan <img> tags
    document.querySelectorAll('img').forEach(img => {
        if (isVisible(img)) {
            rawImages.push({
                element: img,
                type: 'img',
                src: img.src,
                // Use display size for deduplication as requested ("same size in slider")
                width: img.offsetWidth,
                height: img.offsetHeight,
                naturalWidth: img.naturalWidth || img.width,
                naturalHeight: img.naturalHeight || img.height
            });
        }
    });

    // 2. Scan background images
    document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.startsWith('url')) {
            const urlMatch = style.backgroundImage.match(/url\(["']?([^"']*)["']?\)/);
            if (urlMatch && isVisible(el)) {
                rawImages.push({
                    element: el,
                    type: 'background',
                    src: urlMatch[1],
                    width: el.offsetWidth,
                    height: el.offsetHeight,
                    naturalWidth: el.offsetWidth, // Approximate
                    naturalHeight: el.offsetHeight
                });
            }
        }
    });

    // 3. Deduplication & Grouping
    // Key: SectionElement_Width_Height
    const uniqueGroups = new Map();
    const sectionCache = new Map(); // Cache map for section screenshots check

    reportStatus(`Found ${rawImages.length} raw images. Analyzing structure...`);

    for (const img of rawImages) {
        const section = findParentSection(img.element);
        // Using a unique ID for the section object to map it
        if (!section.dataset.scanId) {
            section.dataset.scanId = Math.random().toString(36).substr(2, 9);
        }

        const key = `${section.dataset.scanId}_${img.width}x${img.height}`;

        if (!uniqueGroups.has(key)) {
            uniqueGroups.set(key, {
                imgItem: img,
                section: section,
                sectionId: section.dataset.scanId
            });
        }
    }

    const uniqueItems = Array.from(uniqueGroups.values());
    reportStatus(`Filtered down to ${uniqueItems.length} unique size/section groups. Generating screenshots...`);

    // 4. Excel Generation
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Images');

    worksheet.columns = [
        { header: 'Page URL', key: 'pageUrl', width: 30 },
        { header: 'Section Name', key: 'sectionName', width: 25 },
        { header: 'Section Screenshot', key: 'sectionShot', width: 25 }, // New Column
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Source URL', key: 'src', width: 40 },
        { header: 'Dimensions (Px)', key: 'dimensions', width: 15 },
        { header: 'Image Screenshot', key: 'imgShot', width: 20 }
    ];

    // Cache section screenshots to avoid re-rendering
    const screenshotsCache = {};

    for (let i = 0; i < uniqueItems.length; i++) {
        const { imgItem, section, sectionId } = uniqueItems[i];
        reportStatus(`Processing unique item ${i + 1}/${uniqueItems.length}...`);

        try {
            // A. Image Screenshot
            const imgCanvas = await html2canvas(imgItem.element, {
                useCORS: true, logging: false, allowTaint: false
            });
            const imgBase64 = imgCanvas.toDataURL('image/png');

            // B. Section Screenshot (Cached)
            let sectionBase64 = screenshotsCache[sectionId];
            if (!sectionBase64) {
                // Capture section - might be large, limit height if needed? 
                // For now, capture full section as requested.
                try {
                    const sectionCanvas = await html2canvas(section, {
                        useCORS: true, logging: false, allowTaint: false
                    });
                    sectionBase64 = sectionCanvas.toDataURL('image/png');
                    screenshotsCache[sectionId] = sectionBase64;
                } catch (secErr) {
                    console.error('Error capturing section:', secErr);
                    sectionBase64 = null;
                }
            }

            // C. Metadata
            const pageUrl = window.location.href;
            const sectionName = getSectionTitle(section);

            // Add Row
            const row = worksheet.addRow({
                pageUrl: pageUrl,
                sectionName: sectionName,
                sectionShot: '', // Placeholder
                type: imgItem.type,
                src: imgItem.src,
                dimensions: `${imgItem.width}x${imgItem.height}`,
                imgShot: '' // Placeholder
            });

            // Embed Section Screenshot
            if (sectionBase64) {
                const sectionImageId = workbook.addImage({
                    base64: sectionBase64,
                    extension: 'png',
                });
                worksheet.addImage(sectionImageId, {
                    tl: { col: 2, row: row.number - 1 }, // Column C (0-indexed 2)
                    ext: { width: 150, height: 100 }
                });
            }

            // Embed Image Screenshot
            const imgImageId = workbook.addImage({
                base64: imgBase64,
                extension: 'png',
            });
            worksheet.addImage(imgImageId, {
                tl: { col: 6, row: row.number - 1 }, // Column G (0-indexed 6)
                ext: { width: 100, height: 100 }
            });

            row.height = 90;

        } catch (e) {
            console.error('Error processing item:', e);
            worksheet.addRow({
                pageUrl: window.location.href,
                sectionName: 'Error',
                src: imgItem.src,
                dimensions: `${imgItem.width}x${imgItem.height}`
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
    a.download = `images_scan_v2_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    reportStatus('Done! Scan finished.');
}

function findParentSection(el) {
    // Traverse up to find a semantic section or distinctive container
    let current = el.parentElement;
    while (current && current.tagName !== 'BODY') {
        const tag = current.tagName.toLowerCase();
        // Semantic tags
        if (['section', 'article', 'main', 'header', 'footer', 'nav', 'aside'].includes(tag)) {
            return current;
        }
        // Class/ID heuristics
        if (current.id && (current.id.includes('section') || current.id.includes('container') || current.id.includes('wrapper'))) {
            return current;
        }
        if (current.className && typeof current.className === 'string' && (current.className.includes('section') || current.className.includes('container'))) {
            return current;
        }
        current = current.parentElement;
    }
    return document.body; // Fallback
}

function getSectionTitle(section) {
    // Find first header in the section
    const headers = section.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headers && headers.length > 0) {
        return headers[0].innerText.substring(0, 50).trim(); // Truncate
    }
    // Fallback: ID or Class
    if (section.id) return '#' + section.id;
    if (section.className && typeof section.className === 'string') return '.' + section.className.split(' ')[0];
    return 'Unnamed Section';
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
