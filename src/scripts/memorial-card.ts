type CardSize = 'square' | 'postcard' | 'story';
type CardStyle = 'morning' | 'sunset' | 'breeze';

type SizeConfig = {
  width: number;
  height: number;
  label: string;
};

const dimensions: Record<CardSize, SizeConfig> = {
  square: { width: 1080, height: 1080, label: '1:1' },
  postcard: { width: 1000, height: 1480, label: 'はがき縦版' },
  story: { width: 1080, height: 1920, label: '9:16' },
};

const app = document.querySelector<HTMLElement>('[data-memory-app]');

if (app) {
  const canvas = app.querySelector<HTMLCanvasElement>('[data-memory-canvas]');
  const titleInput = app.querySelector<HTMLInputElement>('[data-card-title]');
  const dateInput = app.querySelector<HTMLInputElement>('[data-card-date]');
  const zoomInput = app.querySelector<HTMLInputElement>('[data-photo-zoom]');
  const resetButton = app.querySelector<HTMLButtonElement>('[data-reset-photo]');
  const downloadButton = app.querySelector<HTMLButtonElement>('[data-download-card]');
  const status = app.querySelector<HTMLElement>('[data-card-status]');
  const fileInputs = app.querySelectorAll<HTMLInputElement>('[data-photo-input]');

  if (!canvas || !titleInput || !dateInput || !zoomInput || !resetButton || !downloadButton || !status) {
    throw new Error('記念カードの初期化に必要な要素が見つかりません。');
  }

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D context is not available.');

  let currentSize: CardSize = 'square';
  let currentStyle: CardStyle = 'morning';
  let photo = new Image();
  let photoReady = false;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let objectUrl: string | null = null;
  let isDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const localToday = new Date();
  dateInput.value = [
    localToday.getFullYear(),
    String(localToday.getMonth() + 1).padStart(2, '0'),
    String(localToday.getDate()).padStart(2, '0'),
  ].join('-');

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'ok';
  };

  const loadPhoto = (src: string, message?: string) => {
    const nextPhoto = new Image();
    nextPhoto.decoding = 'async';
    nextPhoto.onload = () => {
      photo = nextPhoto;
      photoReady = true;
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      zoomInput.value = '1';
      drawCard();
      if (message) setStatus(message);
    };
    nextPhoto.onerror = () => setStatus('写真を読み込めませんでした。別の画像をお試しください。', true);
    nextPhoto.src = src;
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const fitFontSize = (
    text: string,
    maxWidth: number,
    initialSize: number,
    minSize: number,
    family: string,
    weight = 700,
  ) => {
    let size = initialSize;
    while (size > minSize) {
      context.font = `${weight} ${size}px ${family}`;
      if (context.measureText(text).width <= maxWidth) return size;
      size -= 2;
    }
    return minSize;
  };

  const formatDate = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
  };

  const drawPhotoCover = () => {
    const { width: cw, height: ch } = canvas;

    if (!photoReady || !photo.naturalWidth || !photo.naturalHeight) {
      context.fillStyle = '#d9e6e6';
      context.fillRect(0, 0, cw, ch);
      return;
    }

    const baseScale = Math.max(cw / photo.naturalWidth, ch / photo.naturalHeight);
    const actualScale = baseScale * zoom;
    const drawWidth = photo.naturalWidth * actualScale;
    const drawHeight = photo.naturalHeight * actualScale;
    const maxOffsetX = Math.max(0, (drawWidth - cw) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - ch) / 2);

    offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
    offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

    const x = (cw - drawWidth) / 2 + offsetX;
    const y = (ch - drawHeight) / 2 + offsetY;
    context.drawImage(photo, x, y, drawWidth, drawHeight);
  };

  const drawWaveMark = (x: number, y: number, width: number, stroke: string, lineWidth: number) => {
    context.save();
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + width * 0.18, y - width * 0.09, x + width * 0.32, y + width * 0.09, x + width * 0.5, y);
    context.bezierCurveTo(x + width * 0.68, y - width * 0.09, x + width * 0.82, y + width * 0.09, x + width, y);
    context.stroke();
    context.restore();
  };

  const drawMorningStyle = () => {
    const { width: w, height: h } = canvas;
    const pad = Math.round(Math.min(w, h) * 0.055);
    const title = titleInput.value.trim() || '大洗海浜公園';
    const date = formatDate(dateInput.value);

    const overlay = context.createLinearGradient(0, h * 0.35, 0, h);
    overlay.addColorStop(0, 'rgba(8, 40, 49, 0)');
    overlay.addColorStop(0.72, 'rgba(8, 40, 49, 0.48)');
    overlay.addColorStop(1, 'rgba(4, 34, 43, 0.91)');
    context.fillStyle = overlay;
    context.fillRect(0, 0, w, h);

    context.strokeStyle = 'rgba(247, 244, 232, 0.92)';
    context.lineWidth = Math.max(4, Math.round(w * 0.006));
    context.strokeRect(pad * 0.62, pad * 0.62, w - pad * 1.24, h - pad * 1.24);

    context.fillStyle = '#f7f4e8';
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.font = `600 ${Math.round(w * 0.022)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillText('OARAI  /  IBARAKI', pad, h - pad - Math.round(h * 0.17));

    const titleSize = fitFontSize(title, w - pad * 2, w * 0.092, w * 0.052, '"Yu Mincho", "Hiragino Mincho ProN", serif', 700);
    context.font = `700 ${titleSize}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    context.fillText(title, pad, h - pad - Math.round(h * 0.075));

    context.font = `500 ${Math.round(w * 0.028)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillStyle = 'rgba(247, 244, 232, 0.88)';
    context.fillText(date, pad, h - pad);

    drawWaveMark(w - pad - w * 0.23, h - pad * 1.15, w * 0.23, '#f7f4e8', Math.max(4, w * 0.004));
  };

  const drawSunsetStyle = () => {
    const { width: w, height: h } = canvas;
    const pad = Math.round(Math.min(w, h) * 0.06);
    const title = titleInput.value.trim() || '大洗海浜公園';
    const date = formatDate(dateInput.value);

    const warmth = context.createLinearGradient(0, 0, 0, h);
    warmth.addColorStop(0, 'rgba(235, 159, 84, 0.16)');
    warmth.addColorStop(0.48, 'rgba(191, 101, 55, 0.04)');
    warmth.addColorStop(1, 'rgba(38, 36, 42, 0.82)');
    context.fillStyle = warmth;
    context.fillRect(0, 0, w, h);

    context.fillStyle = 'rgba(246, 235, 211, 0.92)';
    drawRoundedRect(context, pad * 0.65, h - pad - h * 0.25, w - pad * 1.3, h * 0.25, Math.round(w * 0.025));
    context.fill();

    context.fillStyle = '#273b43';
    context.textAlign = 'left';
    context.font = `600 ${Math.round(w * 0.022)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillText('PACIFIC COAST MEMORY', pad, h - pad - h * 0.17);

    const titleSize = fitFontSize(title, w - pad * 2, w * 0.086, w * 0.05, '"Yu Mincho", "Hiragino Mincho ProN", serif', 700);
    context.font = `700 ${titleSize}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    context.fillText(title, pad, h - pad - h * 0.078);

    context.fillStyle = '#bf6537';
    context.font = `700 ${Math.round(w * 0.027)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillText(date, pad, h - pad * 1.2);

    context.save();
    context.translate(w - pad * 1.6, h - pad * 1.4);
    context.rotate(-0.12);
    context.strokeStyle = '#bf6537';
    context.lineWidth = Math.max(3, w * 0.004);
    context.beginPath();
    context.arc(0, 0, w * 0.055, 0, Math.PI * 2);
    context.stroke();
    context.font = `700 ${Math.round(w * 0.025)}px "Yu Mincho", serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('大洗', 0, 0);
    context.restore();
  };

  const drawBreezeStyle = () => {
    const { width: w, height: h } = canvas;
    const panelWidth = Math.round(w * 0.28);
    const pad = Math.round(Math.min(w, h) * 0.045);
    const title = titleInput.value.trim() || '大洗海浜公園';
    const date = formatDate(dateInput.value);

    const tint = context.createLinearGradient(0, 0, w, h);
    tint.addColorStop(0, 'rgba(15, 81, 96, 0.1)');
    tint.addColorStop(1, 'rgba(3, 48, 57, 0.28)');
    context.fillStyle = tint;
    context.fillRect(0, 0, w, h);

    context.fillStyle = 'rgba(242, 239, 230, 0.94)';
    context.fillRect(0, 0, panelWidth, h);

    context.fillStyle = '#0d5160';
    context.save();
    context.translate(panelWidth * 0.53, h - pad);
    context.rotate(-Math.PI / 2);
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    const titleSize = fitFontSize(title, h - pad * 3, Math.min(w, h) * 0.075, Math.min(w, h) * 0.045, '"Yu Mincho", "Hiragino Mincho ProN", serif', 700);
    context.font = `700 ${titleSize}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    context.fillText(title, 0, 0);
    context.restore();

    context.save();
    context.translate(panelWidth * 0.53, pad);
    context.rotate(Math.PI / 2);
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = `600 ${Math.round(w * 0.022)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillText(`${date}  •  OARAI`, 0, 0);
    context.restore();

    context.fillStyle = 'rgba(242, 239, 230, 0.95)';
    drawRoundedRect(context, w - pad - w * 0.25, pad, w * 0.25, w * 0.11, w * 0.02);
    context.fill();
    context.fillStyle = '#0d5160';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `700 ${Math.round(w * 0.026)}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    context.fillText('海と、ひと休み。', w - pad - w * 0.125, pad + w * 0.055);

    drawWaveMark(w - pad - w * 0.27, h - pad * 1.35, w * 0.27, '#f2efe6', Math.max(5, w * 0.005));
  };

  const drawCard = () => {
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawPhotoCover();

    if (currentStyle === 'morning') drawMorningStyle();
    if (currentStyle === 'sunset') drawSunsetStyle();
    if (currentStyle === 'breeze') drawBreezeStyle();

    context.restore();
  };

  const updateCanvasSize = (size: CardSize) => {
    currentSize = size;
    const config = dimensions[size];
    canvas.width = config.width;
    canvas.height = config.height;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    zoomInput.value = '1';
    drawCard();
  };

  app.querySelectorAll<HTMLInputElement>('input[name="card-size"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) updateCanvasSize(radio.value as CardSize);
    });
  });

  app.querySelectorAll<HTMLInputElement>('input[name="card-style"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        currentStyle = radio.value as CardStyle;
        drawCard();
      }
    });
  });

  [titleInput, dateInput].forEach((input) => input.addEventListener('input', drawCard));

  zoomInput.addEventListener('input', () => {
    zoom = Number(zoomInput.value);
    drawCard();
  });

  resetButton.addEventListener('click', () => {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    zoomInput.value = '1';
    drawCard();
    setStatus('写真の位置を初期状態に戻しました。');
  });

  fileInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setStatus('画像ファイルを選択してください。', true);
        input.value = '';
        return;
      }

      if (file.size > 30 * 1024 * 1024) {
        setStatus('30MB以下の写真を選択してください。', true);
        input.value = '';
        return;
      }

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      loadPhoto(objectUrl, '写真を端末内で読み込みました。サーバーには送信していません。');
      input.value = '';
    });
  });

  const pointerPosition = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  canvas.addEventListener('pointerdown', (event) => {
    isDragging = true;
    const point = pointerPosition(event);
    lastPointerX = point.x;
    lastPointerY = point.y;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = 'true';
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!isDragging) return;
    const point = pointerPosition(event);
    offsetX += point.x - lastPointerX;
    offsetY += point.y - lastPointerY;
    lastPointerX = point.x;
    lastPointerY = point.y;
    drawCard();
  });

  const stopDragging = (event: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    canvas.dataset.dragging = 'false';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('pointerleave', (event) => {
    if (event.buttons === 0) stopDragging(event);
  });

  downloadButton.addEventListener('click', () => {
    drawCard();
    const datePart = (dateInput.value || 'memory').replaceAll('-', '');
    const fileName = `oarai-kaihin-memory-${datePart}-${currentSize}.png`;

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('画像の生成に失敗しました。もう一度お試しください。', true);
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`${dimensions[currentSize].label}の記念カードを端末に保存しました。`);
    }, 'image/png');
  });

  window.addEventListener('beforeunload', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });

  loadPhoto('/images/hero-oarai.webp');
}
