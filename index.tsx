/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// Declare Tone and html2canvas as they are loaded from CDN
declare var Tone: any;
declare var html2canvas: any;

// --- DOM Elements ---
const canvas = document.getElementById('canvas') as HTMLPreElement | null;
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement | null;
const customTextInput = document.getElementById('customText') as HTMLTextAreaElement | null;
const startPrompt = document.getElementById('start-prompt') as HTMLDivElement | null;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
const changePatternBtn = document.getElementById('changePatternBtn') as HTMLButtonElement | null;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement | null;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement | null;
const restartSequenceBtn = document.getElementById('restartSequenceBtn') as HTMLButtonElement | null;
const wordModeToggle = document.getElementById('word-mode-toggle') as HTMLInputElement | null;
const selectModeToggle = document.getElementById('select-mode-toggle') as HTMLInputElement | null;
const overwriteToggle = document.getElementById('overwrite-toggle') as HTMLInputElement | null;
const tempoToggle = document.getElementById('tempo-toggle') as HTMLInputElement | null;
const tempoControls = document.getElementById('tempo-controls') as HTMLDivElement | null;
const followMouseToggle = document.getElementById('follow-mouse-toggle') as HTMLInputElement | null;
const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement | null;
const bpmValue = document.getElementById('bpm-value') as HTMLSpanElement | null;
const rateSelector = document.getElementById('rate-selector') as HTMLSelectElement | null;
const selectionBox = document.getElementById('selection-box') as HTMLDivElement | null;
const ratioToolbar = document.getElementById('ratio-toolbar') as HTMLDivElement | null;
const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLDivElement | null;
const patternInfo = document.getElementById('patternInfo') as HTMLDivElement | null;
const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement | null;
const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement | null;


// --- State ---
let isDrawing = false;
let grid: string[][] = [];
let cols: number = 0;
let rows: number = 0;
let charWidth: number = 0;
let charHeight: number = 0;
let currentPatternIndex = 0;
let customTextIndex = 0;
let customWordIndex = 0;
let patternSequenceIndex = 0;
let synth: any; // Using 'any' for Tone.js synth for simplicity
let drawHistory: Array<{ type: string, row?: number, col?: number, wasCustom?: boolean, chars?: Array<{char: string, row: number, col: number}> }> = [];
let mode = 'draw'; // 'draw' or 'select'

interface SelectionState {
    active: boolean;
    startCol: number;
    startRow: number;
    endCol: number;
    endRow: number;
    isDragging: boolean;
    dragStartCol?: number;
    dragStartRow?: number;
    content: string[][];
}
interface Point {
    clientX: number;
    clientY: number;
}

let selection: SelectionState = { active: false, startCol: -1, startRow: -1, endCol: -1, endRow: -1, isDragging: false, content: [] };
let activeRatio = 'auto';
let drawingLoop: any; // Using 'any' for Tone.js Loop
let sequencer = { headCol: 0, headRow: 0, active: false };
let lastMousePos: Point = { clientX: 0, clientY: 0 };


const patterns = [
    { name: "C Major Arp (Up)", characters: ['<', '-', '=', '>'], notes: ['C4', 'E4', 'G4', 'C5'] },
    { name: "A Minor Arp (Up/Down)", characters: ['/', '^', '\\', 'v'], notes: ['A3', 'C4', 'E4', 'A4', 'E4', 'C4'] },
    { name: "G Major Arp (Wide)", characters: ['.', 'o', 'O', '0', '@', '*'], notes: ['G3', 'B3', 'D4', 'G4', 'B4', 'D5'] },
    { name: "F Major 7 Arp (Jazzy)", characters: ['~', '`', ',', ';'], notes: ['F3', 'A3', 'C4', 'E4'] },
    { name: "E Minor Pentatonic (Bluesy)", characters: ['-', '_', '=', '#', '+'], notes: ['E3', 'G3', 'A3', 'B3', 'D4'] },
    { name: "Floyd's Money (B Minor)", characters: ['M', 'O', 'N', 'E', 'Y'], notes: ['B2', 'F#3', 'B2', 'A2', 'B2', 'F#2', 'A2', 'D3'] }
];

// --- Functions ---
async function initAudio() {
    await Tone.start();
    synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fmsine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 } }).toDestination();
    if (startPrompt) startPrompt.style.display = 'none';
}

function calculateGridSize() {
    const tempSpan = document.createElement('span');
    if (!canvas) return;
    const computedStyle = getComputedStyle(canvas);
    tempSpan.style.fontFamily = computedStyle.fontFamily;
    tempSpan.style.fontSize = computedStyle.fontSize;
    tempSpan.style.lineHeight = computedStyle.lineHeight;
    tempSpan.style.visibility = 'hidden'; tempSpan.style.position = 'absolute'; tempSpan.textContent = 'M';
    document.body.appendChild(tempSpan);
    charWidth = tempSpan.getBoundingClientRect().width;
    charHeight = tempSpan.getBoundingClientRect().height;
    document.body.removeChild(tempSpan);

    if (charWidth <= 0 || charHeight <= 0) { 
        console.warn("Calculated charWidth or charHeight is zero or negative. Fallback to default.");
        charWidth = 8; charHeight = 16; // Fallback
    }
    if (!canvasContainer) return;
    cols = Math.floor(canvasContainer.clientWidth / charWidth);
    rows = Math.floor(canvasContainer.clientHeight / charHeight);

    if (cols <= 0 || rows <=0) {
        console.warn(`Invalid grid dimensions: ${cols}x${rows}. Client: ${canvasContainer.clientWidth}x${canvasContainer.clientHeight}, Char: ${charWidth}x${charHeight}`);
    }
}

function initGrid() {
    setCanvasSize();
    calculateGridSize();
    if (isNaN(rows) || isNaN(cols) || rows <=0 || cols <=0) {
        // console.warn("Grid dimensions are invalid, skipping grid initialization until next resize/font load");
        return;
    }
    grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
    drawHistory = [];
    resetSelection();
    renderGrid();
}

function renderGrid() { if(canvas && grid.length > 0) canvas.textContent = grid.map(row => row.join('')).join('\n'); }
function updatePatternInfo() { if (patternInfo) patternInfo.textContent = `Sound: ${patterns[currentPatternIndex].name}`; }

function drawAtPosition(col: number, row: number): number {
    if (!isValidCoord(col, row) || !customTextInput || !wordModeToggle) return 0;
    
    const customText = customTextInput.value.replace(/(\r\n|\n|\r)/gm, " ");
    const soundPattern = patterns[currentPatternIndex];
    
    if (wordModeToggle.checked && customText.length > 0) {
        return drawWord(col, row, customText, soundPattern);
    } else {
        return drawCharacter(col, row, customText, soundPattern);
    }
}

function drawCharacter(col: number, row: number, customText: string, soundPattern: typeof patterns[0]): number {
    let char: string, note: string;
    if (customText.length > 0) {
        if (customTextIndex >= customText.length) customTextIndex = 0;
        char = customText[customTextIndex];
        note = soundPattern.notes[customTextIndex % soundPattern.notes.length];
        customTextIndex++;
    } else {
        const noteIndex = patternSequenceIndex % soundPattern.notes.length;
        const charIndex = patternSequenceIndex % soundPattern.characters.length;
        note = soundPattern.notes[noteIndex];
        char = soundPattern.characters[charIndex];
        patternSequenceIndex++;
    }
    if (char === ' ') return 1; 
    
    const canDraw = (overwriteToggle && overwriteToggle.checked) || (grid[row] && grid[row][col] === ' ');
    if (canDraw) {
        grid[row][col] = char;
        drawHistory.push({ type: 'char', row, col, wasCustom: customText.length > 0 });
        renderGrid();
        if (synth) synth.triggerAttackRelease(note, '8n', Tone.now());
    }
    return 1;
}

function drawWord(col: number, row: number, customText: string, soundPattern: typeof patterns[0]): number {
    const words = customText.split(' ').filter(w => w.length > 0);
    if (words.length === 0) return 0;
    if (customWordIndex >= words.length) customWordIndex = 0; 

    const word = words[customWordIndex];
    if (col + word.length > cols) return 0; 

    let wordChars: Array<{char: string, row: number, col: number}> = [];
    for (let i = 0; i < word.length; i++) {
        const targetCol = col + i;
        const canDraw = (overwriteToggle && overwriteToggle.checked) || (grid[row] && grid[row][targetCol] === ' ');
        if (!canDraw) return 0; 
        wordChars.push({ char: word[i], row: row, col: targetCol });
    }
    
    wordChars.forEach(c => { if(grid[c.row]) grid[c.row][c.col] = c.char; });
    drawHistory.push({ type: 'word', chars: wordChars });
    renderGrid();
    const chord = soundPattern.notes.slice(0, Math.min(3, soundPattern.notes.length)); 
    if (synth && chord.length > 0) synth.triggerAttackRelease(chord, '4n', Tone.now());
    customWordIndex++;
    return word.length;
}

function handleMouseDown(e: MouseEvent | TouchEvent) {
    isDrawing = true;
    const { col, row } = getCoordsFromEvent(e);
    if (!isValidCoord(col, row)) return;

    if (tempoToggle && tempoToggle.checked) {
        sequencer.headCol = col;
        sequencer.headRow = row;
        sequencer.active = true;
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
    } else if (mode === 'draw') {
        drawAtPosition(col, row);
    } else if (mode === 'select') {
        if (selection.active && isCoordInSelection(col, row)) {
            selection.isDragging = true;
            if(selectionBox) selectionBox.classList.add('is-dragging');
            selection.dragStartCol = col;
            selection.dragStartRow = row;
            copySelectionToBuffer();
            clearSelectionFromGrid();
            renderGrid();
        } else {
            resetSelection();
            selection.active = true;
            selection.startCol = col;
            selection.startRow = row;
            selection.endCol = col;
            selection.endRow = row;
            updateSelectionBox(); // Show selection box immediately on first click
        }
    }
}

function handleMouseMove(e: MouseEvent | TouchEvent) {
    lastMousePos = { 
        clientX: (e as MouseEvent).clientX ?? (e as TouchEvent).touches[0].clientX, 
        clientY: (e as MouseEvent).clientY ?? (e as TouchEvent).touches[0].clientY 
    };
    if ((wordModeToggle && wordModeToggle.checked) || !isDrawing || (tempoToggle && tempoToggle.checked)) return;
    
    const { col, row } = getCoordsFromEvent(e);
    
    if (mode === 'draw') {
         if (!isValidCoord(col, row)) return;
         drawAtPosition(col, row);
    } else if (mode === 'select' && selection.active) {
        if (selection.isDragging) {
            const { startC, startR } = getSelectionBounds();
            const deltaCol = col - (selection.dragStartCol ?? 0);
            const deltaRow = row - (selection.dragStartRow ?? 0);
            const newLeft = (startC * charWidth) + (deltaCol * charWidth);
            const newTop = (startR * charHeight) + (deltaRow * charHeight);
            if(selectionBox) selectionBox.style.transform = `translate(${newLeft - (startC * charWidth)}px, ${newTop - (startR * charHeight)}px)`;
        } else {
            if (!isValidCoord(col, row)) return;
            selection.endCol = col;
            selection.endRow = row;
            updateSelectionBox();
        }
    }
}

function handleMouseUp(e: MouseEvent | TouchEvent) {
    isDrawing = false;
    // sequencer.active = false; // Keep sequencer active if tempo mode is on
    if (tempoToggle && tempoToggle.checked) {
        // Only set sequencer.active to false if not dragging in select mode
        if (!(mode === 'select' && selection.isDragging)) {
             sequencer.active = false;
        }
    } else {
        sequencer.active = false;
    }

    if (mode === 'select') {
        if (selection.isDragging) {
            pasteSelectionFromBuffer(getCoordsFromEvent(e));
        }
        selection.isDragging = false;
        if(selectionBox) {
            selectionBox.classList.remove('is-dragging');
            selectionBox.style.transform = 'translate(0, 0)';
        }
        if(selection.active) updateSelectionBox(); 
    }
}

function copySelectionToBuffer() {
    selection.content = [];
    const { startC, startR, endC, endR } = getSelectionBounds();
    for (let r = startR; r <= endR; r++) {
        let rowContent: string[] = [];
        for (let c = startC; c <= endC; c++) {
            if(grid[r] && grid[r][c] !== undefined) rowContent.push(grid[r][c]);
            else rowContent.push(' '); 
        }
        selection.content.push(rowContent);
    }
}

function clearSelectionFromGrid() {
    const { startC, startR, endC, endR } = getSelectionBounds();
    for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
            if(isValidCoord(c,r) && grid[r]) grid[r][c] = ' ';
        }
    }
}

function pasteSelectionFromBuffer({ col, row }: { col: number, row: number }) {
    const deltaCol = col - (selection.dragStartCol ?? 0);
    const deltaRow = row - (selection.dragStartRow ?? 0);
    const { startC, startR } = getSelectionBounds();
    const pasteStartCol = startC + deltaCol;
    const pasteStartRow = startR + deltaRow;

    selection.content.forEach((rowContent, rIdx) => {
        rowContent.forEach((char, cIdx) => {
            const targetRow = pasteStartRow + rIdx;
            const targetCol = pasteStartCol + cIdx;
            if (isValidCoord(targetCol, targetRow) && char !== ' ' && grid[targetRow]) {
                grid[targetRow][targetCol] = char;
            }
        });
    });
    renderGrid();
    resetSelection();
}

function resetSelection() {
    selection = { active: false, startCol: -1, startRow: -1, endCol: -1, endRow: -1, isDragging: false, content: [] };
    if(selectionBox) {
        selectionBox.classList.add('hidden');
        selectionBox.style.transform = 'translate(0,0)';
    }
}

function getSelectionBounds() {
    const startC = Math.min(selection.startCol, selection.endCol);
    const startR = Math.min(selection.startRow, selection.endRow);
    const endC = Math.max(selection.startCol, selection.endCol);
    const endR = Math.max(selection.startRow, selection.endRow);
    return { startC, startR, endC, endR };
}

function updateSelectionBox() {
    if (!selection.active || !selectionBox) { if(selectionBox) selectionBox.classList.add('hidden'); return; }
    selectionBox.classList.remove('hidden');
    const { startC, startR, endC, endR } = getSelectionBounds();
    if (isNaN(startC*charWidth) || charWidth === 0 || charHeight === 0) return; 
    selectionBox.style.left = `${startC * charWidth}px`;
    selectionBox.style.top = `${startR * charHeight}px`;
    selectionBox.style.width = `${(endC - startC + 1) * charWidth}px`;
    selectionBox.style.height = `${(endR - startR + 1) * charHeight}px`;
}

function getCoordsFromEvent(e: MouseEvent | TouchEvent | Point): { col: number, row: number } {
    if (!canvasContainer || !charWidth || !charHeight || charWidth === 0 || charHeight === 0) return { col: -1, row: -1};
    const rect = canvasContainer.getBoundingClientRect();
    
    let eventClientX: number;
    let eventClientY: number;

    if ('touches' in e && (e as TouchEvent).touches && (e as TouchEvent).touches.length > 0) {
        eventClientX = (e as TouchEvent).touches[0].clientX;
        eventClientY = (e as TouchEvent).touches[0].clientY;
    } 
    else if ('clientX' in e && 'clientY' in e) { // Covers MouseEvent and Point
        eventClientX = e.clientX;
        eventClientY = e.clientY;
    } 
    else {
        console.warn('getCoordsFromEvent: Could not extract coordinates from event', e);
        return { col: -1, row: -1 };
    }

    return { 
        col: Math.floor((eventClientX - rect.left) / charWidth), 
        row: Math.floor((eventClientY - rect.top) / charHeight) 
    };
}

function isValidCoord(col: number, row: number): boolean { return row >= 0 && row < rows && col >= 0 && col < cols; }

function isCoordInSelection(col: number, row: number): boolean {
    if (!selection.active) return false;
    const { startC, startR, endC, endR } = getSelectionBounds();
    return col >= startC && col <= endC && row >= startR && row <= endR;
}

function handleKeyDown(e: KeyboardEvent) {
    if (document.activeElement === customTextInput) return;
    let soundChanged = false;
    switch(e.key.toLowerCase()) {
        case 'backspace':
            e.preventDefault();
            if(selection.active) {
                clearSelectionFromGrid(); renderGrid(); resetSelection();
            } else if (drawHistory.length > 0 && synth) {
                const lastAction = drawHistory.pop();
                if (lastAction) {
                    if (lastAction.type === 'word' && lastAction.chars) {
                        lastAction.chars.forEach(c => { if(isValidCoord(c.col, c.row) && grid[c.row]) grid[c.row][c.col] = ' '; });
                        if (customWordIndex > 0) customWordIndex--;
                    } else if (lastAction.type === 'char' && lastAction.row !== undefined && lastAction.col !== undefined) {
                         if(isValidCoord(lastAction.col, lastAction.row) && grid[lastAction.row]) grid[lastAction.row][lastAction.col] = ' ';
                         if (lastAction.wasCustom) {
                            if (customTextIndex > 0) customTextIndex--;
                        } else {
                            if (patternSequenceIndex > 0) patternSequenceIndex--;
                        }
                    }
                    renderGrid(); 
                    synth.triggerAttackRelease('C2', '8n', Tone.now());
                }
            }
            break;
        case 'a':
            currentPatternIndex = (currentPatternIndex - 1 + patterns.length) % patterns.length;
            soundChanged = true;
            break;
        case 's':
            currentPatternIndex = (currentPatternIndex + 1) % patterns.length;
            soundChanged = true;
            break;
        case 'escape': 
            resetSelection();
            break;
    }
    if (soundChanged) { patternSequenceIndex = 0; customTextIndex = 0; customWordIndex = 0; updatePatternInfo(); }
}

function setCanvasSize() {
    if (!canvasWrapper || !canvasContainer) return;
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    let targetWidth = wrapperRect.width;
    let targetHeight = wrapperRect.height;
    if (activeRatio !== 'auto') {
        const [w, h] = activeRatio.split('/').map(Number);
        const ratio = w / h;
        targetHeight = targetWidth / ratio;
        if (targetHeight > wrapperRect.height) {
            targetHeight = wrapperRect.height;
            targetWidth = targetHeight * ratio;
        }
    }
    canvasContainer.style.width = `${targetWidth}px`;
    canvasContainer.style.height = `${targetHeight}px`;
}

// --- Event Listeners ---
if (startBtn) startBtn.addEventListener('click', initAudio);
window.addEventListener('resize', initGrid);
if (clearBtn) clearBtn.addEventListener('click', initGrid);
document.addEventListener('keydown', handleKeyDown);

if (changePatternBtn) {
    changePatternBtn.addEventListener('click', () => { 
        currentPatternIndex = (currentPatternIndex + 1) % patterns.length;
        patternSequenceIndex = 0; customTextIndex = 0; customWordIndex = 0;
        updatePatternInfo(); 
    });
}
if (restartSequenceBtn) {
    restartSequenceBtn.addEventListener('click', () => {
        customTextIndex = 0;
        customWordIndex = 0;
        patternSequenceIndex = 0;
        restartSequenceBtn.classList.add('bg-green-500'); 
        setTimeout(() => { restartSequenceBtn.classList.remove('bg-green-500'); }, 300);
    });
}
if (customTextInput) {
    customTextInput.addEventListener('input', () => { customTextIndex = 0; customWordIndex = 0; });
}
if (canvasContainer) {
    canvasContainer.addEventListener('mousedown', handleMouseDown);
    canvasContainer.addEventListener('mousemove', handleMouseMove);
    canvasContainer.addEventListener('touchstart', (e) => { e.preventDefault(); handleMouseDown(e); }, { passive: false });
    canvasContainer.addEventListener('touchmove', (e) => { e.preventDefault(); handleMouseMove(e); }, { passive: false });
}
document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('touchend', handleMouseUp);

if (selectModeToggle) {
    selectModeToggle.addEventListener('change', (e) => {
        mode = (e.target as HTMLInputElement).checked ? 'select' : 'draw';
        if(canvasContainer) canvasContainer.style.cursor = mode === 'select' ? 'crosshair' : 'text';
        resetSelection(); 
    });
}

if (tempoToggle && bpmSlider && rateSelector && customTextInput && wordModeToggle && followMouseToggle && overwriteToggle) {
    tempoToggle.addEventListener('change', (e) => {
        const isTempoOn = (e.target as HTMLInputElement).checked;
        if(tempoControls) tempoControls.classList.toggle('hidden', !isTempoOn);
        overwriteToggle.disabled = isTempoOn; 

        if (isTempoOn) {
            Tone.Transport.bpm.value = parseInt(bpmSlider.value);
            drawingLoop = new Tone.Loop((time: number) => {
                Tone.Draw.schedule(() => {
                    if(sequencer.active) { // Sequencer starts drawing when mouse is pressed on canvas
                        let advanceBy = 0;
                        if(followMouseToggle.checked) {
                            const { col, row } = getCoordsFromEvent(lastMousePos);
                            if(isValidCoord(col, row)) drawAtPosition(col, row);
                        } else {
                             const currentCustomText = customTextInput.value.replace(/(\r\n|\n|\r)/gm, " ");
                             const currentSoundPattern = patterns[currentPatternIndex];

                            if (wordModeToggle.checked && currentCustomText.length > 0) {
                                 const words = currentCustomText.split(' ').filter(w => w.length > 0);
                                 if(words.length > 0) {
                                     const wordToDraw = words[customWordIndex % words.length]; 
                                     advanceBy = drawWord(sequencer.headCol, sequencer.headRow, currentCustomText, currentSoundPattern);
                                     sequencer.headCol += advanceBy > 0 ? (wordToDraw.length + 1) : 1; 
                                 } else {
                                     sequencer.headCol++; 
                                 }
                            } else {
                                advanceBy = drawCharacter(sequencer.headCol, sequencer.headRow, currentCustomText, currentSoundPattern);
                                sequencer.headCol += advanceBy;
                            }

                            if (sequencer.headCol >= cols) {
                                sequencer.headCol = 0;
                                sequencer.headRow++;
                            }
                            if(sequencer.headRow >= rows) {
                                sequencer.headRow = 0; 
                            }
                        }
                    }
                }, time);
            }, rateSelector.value).start(0);
            if(Tone.Transport.state !== 'started') Tone.Transport.start();

        } else {
            if (drawingLoop) drawingLoop.dispose();
            Tone.Transport.stop(); 
            sequencer.active = false;
        }
    });
}

if (bpmSlider && bpmValue) {
    bpmSlider.addEventListener('input', (e) => {
        const newBpm = parseInt((e.target as HTMLInputElement).value);
        bpmValue.textContent = newBpm.toString();
        Tone.Transport.bpm.value = newBpm;
    });
}
if (rateSelector) {
    rateSelector.addEventListener('change', (e) => {
        if(drawingLoop) drawingLoop.interval = (e.target as HTMLSelectElement).value;
    });
}

if (bgColorPicker && canvasContainer) {
    bgColorPicker.addEventListener('input', (e) => { canvasContainer.style.backgroundColor = (e.target as HTMLInputElement).value; });
}
if (textColorPicker && canvas) {
    textColorPicker.addEventListener('input', (e) => { canvas.style.color = (e.target as HTMLInputElement).value; });
}

if (saveBtn && canvasContainer && bgColorPicker && textColorPicker) {
    saveBtn.addEventListener('click', () => {
        resetSelection(); 
        setTimeout(() => { 
            html2canvas(canvasContainer, {
                 backgroundColor: bgColorPicker.value,
                 onclone: (doc: Document) => {
                    const clonedCanvas = doc.getElementById('canvas') as HTMLPreElement | null;
                    if(clonedCanvas) clonedCanvas.style.color = textColorPicker.value;
                 }
            }).then((cvs: HTMLCanvasElement) => {
                const link = document.createElement('a');
                link.download = 'ascii-sound-drawer.png';
                link.href = cvs.toDataURL('image/png');
                link.click();
            });
        }, 100);
    });
}

if (ratioToolbar) {
    ratioToolbar.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        if (target.classList.contains('ratio-btn')) {
            activeRatio = target.dataset.ratio || 'auto';
            document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            initGrid();
        }
    });
}

function initializeApp() {
    initGrid();
    updatePatternInfo();
}

if (document.fonts) {
    document.fonts.ready.then(initializeApp).catch(err => {
        console.warn("Font loading error or timeout, initializing app with fallback.", err);
        initializeApp();
    });
} else {
    window.addEventListener('load', initializeApp);
}