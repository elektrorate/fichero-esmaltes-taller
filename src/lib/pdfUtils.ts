import jsPDF from 'jspdf';
import { Glaze, FiringSegment } from '../types';
import { STATUS_LABELS } from '../constants';
import { computeCurve } from '../firingCurve/engine';
import { firingCurveToProgram } from '../firingCurve/glazeToProgram';
import { buildCurveSvg, svgToPngDataUrl } from '../firingCurve/svgChart';

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

const imageToDataUrl = (img: HTMLImageElement): string => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
};

const getImageData = async (url: string): Promise<string> => {
  return imageToDataUrl(await loadImage(url));
};

const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  const maxY = doc.internal.pageSize.getHeight() - 18;
  if (y + needed > maxY) {
    doc.addPage();
    return 20;
  }
  return y;
};

const addHeading = (doc: jsPDF, text: string, x: number, y: number): number => {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(text, x, y);
  return y + 8;
};

const addSubHeading = (doc: jsPDF, text: string, x: number, y: number): number => {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(text.toUpperCase(), x, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  return y + 5;
};

const markdownToPlain = (markdown: string): string =>
  markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`/g, '')
    .trim();

const renderRichText = (doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number => {
  if (!text) return y;
  const rawLines = text.split(/\n/);
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) {
      y += 3;
      continue;
    }
    const isList = /^[-*+]\s/.test(line);
    const cleaned = markdownToPlain(line).replace(/^[-*+]\s*/, '');
    const content = isList ? `• ${cleaned}` : cleaned;
    const wrapped = doc.splitTextToSize(content, maxWidth);
    doc.text(wrapped, x, y);
    y += wrapped.length * 5 + 2;
  }
  return y + 2;
};

const renderKeyValues = (
  doc: jsPDF,
  pairs: Array<{ label: string; value?: string | number }>,
  x: number,
  y: number,
  maxWidth: number
): number => {
  const filtered = pairs.filter((p) => p.value !== undefined && p.value !== null && String(p.value) !== '');
  doc.setFontSize(10);
  filtered.forEach((pair) => {
    y = ensureSpace(doc, y, 8);
    doc.setFont('helvetica', 'bold');
    doc.text(pair.label, x, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(String(pair.value), maxWidth - 45);
    doc.text(wrapped, x + 45, y);
    y += Math.max(6, wrapped.length * 5 + 1);
  });
  return y + 3;
};

const colWidths = [16, 30, 32, 26, 73];

const renderSegmentsTable = (
  doc: jsPDF,
  segments: FiringSegment[],
  x: number,
  y: number,
  pageWidth: number
): number => {
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = x;
  const endX = x + tableWidth;
  const headerRow = () => {
    doc.setFillColor(45, 52, 54);
    doc.rect(startX, y - 5, tableWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Nº', startX + 2, y);
    doc.text('Velocidad', startX + 18, y);
    doc.text('T° objetivo', startX + 50, y);
    doc.text('Meseta', startX + 84, y);
    doc.text('Observaciones', startX + 112, y);
    doc.setTextColor(45, 52, 54);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    y += 8;
  };

  y = ensureSpace(doc, y, 12);
  headerRow();

  segments.forEach((seg) => {
    y = ensureSpace(doc, y, 10);
    if (y <= 22) {
      y += 2;
      headerRow();
    }
    const notes = seg.notes || '';
    const notesWrapped = doc.splitTextToSize(notes, colWidths[4] - 4);
    const rowH = Math.max(7, notesWrapped.length * 5 + 2);

    doc.setFontSize(9);
    doc.text(String(seg.index || ''), startX + 2, y);
    doc.text(seg.rate !== undefined ? `${seg.rate} °C/h` : '', startX + 18, y);
    doc.text(seg.targetTemperature !== undefined ? `${seg.targetTemperature} °C` : '', startX + 50, y);
    doc.text(
      seg.soak !== undefined && seg.soak !== 0 ? `${seg.soak} ${seg.soakUnit || 'min'}` : '',
      startX + 84,
      y
    );
    doc.text(notesWrapped, startX + 112, y);
    doc.setLineWidth(0.15);
    doc.setDrawColor(228, 228, 226);
    doc.line(startX, y + 3, endX, y + 3);
    doc.setFontSize(10);
    y += rowH;
  });

  return y + 5;
};

// Dibuja una lista de fotos en una cuadrícula de varias columnas dentro del PDF.
const renderPhotoGrid = async (
  doc: jsPDF,
  title: string,
  photos: string[],
  x: number,
  y: number
): Promise<number> => {
  if (!photos.length) return y;
  y = ensureSpace(doc, y, 16);
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 30;
  y = addHeading(doc, title, x, y);
  const cols = 3;
  const gap = 5;
  const cellW = (maxWidth - gap * (cols - 1)) / cols;
  const cellH = 55;
  let col = 0;
  let rowY = y;
  for (const url of photos) {
    let image: HTMLImageElement;
    try {
      image = await loadImage(url);
    } catch (error) {
      console.error('Error adding photo to PDF:', error);
      continue;
    }
    const ratio = Math.min(cellW / image.width, cellH / image.height, 1);
    const w = image.width * ratio;
    const h = image.height * ratio;
    const cellX = x + col * (cellW + gap);
    rowY = ensureSpace(doc, rowY, cellH + 6);
    const dataUrl = imageToDataUrl(image);
    doc.addImage(dataUrl, 'JPEG', cellX + (cellW - w) / 2, rowY + (cellH - h) / 2, w, h);
    col += 1;
    if (col >= cols) {
      col = 0;
      rowY += cellH + 6;
    }
  }
  if (col !== 0) rowY += cellH + 6;
  return rowY + 6;
};

const renderApplicationPhotos = async (
  doc: jsPDF,
  photos: Array<{ url: string; caption?: string }>,
  x: number,
  y: number
): Promise<number> => {
  const maxWidth = 80;
  const maxHeight = 55;
  for (const photo of photos) {
    try {
      const img = await loadImage(photo.url);
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const w = img.width * ratio;
      const h = img.height * ratio;
      y = ensureSpace(doc, y, h + 10);
      const dataUrl = imageToDataUrl(img);
      doc.addImage(dataUrl, 'JPEG', x, y, w, h);
      y += h;
      if (photo.caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        const cap = doc.splitTextToSize(photo.caption, maxWidth);
        doc.text(cap, x, y + 3);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        y += 3 + cap.length * 4 + 4;
      } else {
        y += 6;
      }
    } catch (error) {
      console.error('Error adding application photo to PDF:', error);
    }
  }
  return y;
};

const renderTechSections = async (doc: jsPDF, glaze: Glaze, startY: number): Promise<number> => {
  const x = 15;
  const maxWidth = doc.internal.pageSize.getWidth() - 30;
  const { techSpecs, preparation, firingCurve, analysis, application, safety } = glaze;
  let y = ensureSpace(doc, startY, 16);
  y = addHeading(doc, 'Información Técnica Ampliada', x, y);

  if (techSpecs) {
    const pairs: Array<{ label: string; value?: string | number }> = [
      { label: 'Cono Orton:', value: techSpecs.cone ? `Cono ${techSpecs.cone}` : undefined },
      { label: 'Temperatura:', value: techSpecs.targetTemperature !== undefined ? `${techSpecs.targetTemperature} °C` : undefined },
      { label: 'Atmósfera:', value: techSpecs.atmosphere },
      { label: 'Pasta:', value: techSpecs.clayBodyType },
      { label: 'Aplicación:', value: techSpecs.applicationMethods?.join(', ') },
    ];
    const hasInfo = pairs.some((p) => p.value !== undefined && String(p.value) !== '') || !!techSpecs.characteristics;
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '1. Ficha técnica', x, y);
      y = renderKeyValues(doc, pairs, x, y, maxWidth);
      if (techSpecs.characteristics) {
        y = addSubHeading(doc, 'Características principales', x, y);
        y = ensureSpace(doc, y, 10);
        y = renderRichText(doc, techSpecs.characteristics, x, y, maxWidth);
      }
    }
  }

  if (preparation) {
    const hasInfo =
      !!preparation.mixingOrder ||
      !!preparation.initialWater ||
      !!preparation.sieving ||
      !!preparation.resting ||
      !!preparation.suspensionTips;
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '2. Preparación', x, y);
      if (preparation.mixingOrder) {
        y = addSubHeading(doc, 'Orden de mezclado', x, y);
        y = renderRichText(doc, preparation.mixingOrder, x, y, maxWidth);
      }
      const pairs: Array<{ label: string; value?: string }> = [
        { label: 'Agua inicial:', value: preparation.initialWater },
        { label: 'Tamizado:', value: preparation.sieving },
        { label: 'Reposo:', value: preparation.resting },
      ];
      y = renderKeyValues(doc, pairs, x, y, maxWidth);
      if (preparation.suspensionTips) {
        y = addSubHeading(doc, 'Recomendaciones para suspensión', x, y);
        y = renderRichText(doc, preparation.suspensionTips, x, y, maxWidth);
      }
    }
  }

  const segments = firingCurve?.segments || [];
  if (firingCurve) {
    const hasInfo =
      !!firingCurve.name ||
      !!firingCurve.program ||
      firingCurve.finalTemperature !== undefined ||
      firingCurve.finalSoak !== undefined ||
      !!firingCurve.cooling ||
      !!firingCurve.essentialParameters ||
      !!firingCurve.additionalNotes ||
      segments.length > 0;
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '3. Curva de cocción', x, y);
      const pairs: Array<{ label: string; value?: string | number }> = [
        { label: 'Referencia:', value: firingCurve.name },
        { label: 'Programa:', value: firingCurve.program },
        { label: 'Temperatura final:', value: firingCurve.finalTemperature !== undefined ? `${firingCurve.finalTemperature} °C` : undefined },
        { label: 'Meseta final:', value: firingCurve.finalSoak !== undefined ? `${firingCurve.finalSoak} ${firingCurve.finalSoakUnit || 'min'}` : undefined },
      ];
      y = renderKeyValues(doc, pairs, x, y, maxWidth);
      if (firingCurve.cooling) {
        y = addSubHeading(doc, 'Enfriamiento', x, y);
        y = renderRichText(doc, firingCurve.cooling, x, y, maxWidth);
      }
      if (firingCurve.essentialParameters) {
        y = addSubHeading(doc, 'Parámetros esenciales', x, y);
        y = renderRichText(doc, firingCurve.essentialParameters, x, y, maxWidth);
      }
      if (firingCurve.additionalNotes) {
        y = addSubHeading(doc, 'Observaciones adicionales', x, y);
        y = renderRichText(doc, firingCurve.additionalNotes, x, y, maxWidth);
      }
      // Gráfica de la curva como imagen (rasterizada desde el SVG estático).
      const chartProgram = firingCurveToProgram(firingCurve);
      if (chartProgram) {
        const res = computeCurve(chartProgram);
        if (res.ok && res.segments.length > 0) {
          try {
            const svg = buildCurveSvg(chartProgram, res);
            const dataUrl = await svgToPngDataUrl(svg);
            const chartW = maxWidth;
            const chartH = chartW / 2; // ratio 800x400
            y = ensureSpace(doc, y, chartH + 10);
            y = addSubHeading(doc, 'Gráfica de la curva', x, y);
            y += 2;
            doc.addImage(dataUrl, 'PNG', x, y, chartW, chartH);
            y += chartH + 6;
          } catch (error) {
            console.error('Error añadiendo la gráfica de la curva al PDF:', error);
          }
        }
      }
      if (segments.length > 0) {
        y = addSubHeading(doc, 'Segmentos de cocción', x, y);
        y = renderSegmentsTable(doc, segments, x, y, doc.internal.pageSize.getWidth());
      }
    }
  }

  if (analysis) {
    const blocks: Array<[string, string | undefined]> = [
      ['Comportamiento químico', analysis.chemicalBehavior],
      ['Función de las materias primas', analysis.rawMaterialFunctions],
      ['Defectos observados', analysis.defects],
      ['Posibles ajustes', analysis.adjustments],
      ['Observaciones generales', analysis.generalNotes],
    ];
    const hasInfo = blocks.some(([, v]) => !!v);
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '4. Análisis y observaciones', x, y);
      for (const [title, value] of blocks) {
        if (value) {
          y = addSubHeading(doc, title, x, y);
          y = renderRichText(doc, value, x, y, maxWidth);
        }
      }
    }
  }

  const photos = application?.photos || [];
  if (application) {
    const hasInfo =
      !!application.layers ||
      (application.techniques?.length || 0) > 0 ||
      !!application.behaviorOnClays ||
      !!application.recommendations ||
      photos.length > 0;
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '5. Aplicación', x, y);
      const pairs: Array<{ label: string; value?: string }> = [
        { label: 'Capas / espesor:', value: application.layers },
        { label: 'Técnicas:', value: application.techniques?.join(', ') },
      ];
      y = renderKeyValues(doc, pairs, x, y, maxWidth);
      if (application.behaviorOnClays) {
        y = addSubHeading(doc, 'Comportamiento sobre pastas', x, y);
        y = renderRichText(doc, application.behaviorOnClays, x, y, maxWidth);
      }
      if (application.recommendations) {
        y = addSubHeading(doc, 'Recomendaciones de aplicación', x, y);
        y = renderRichText(doc, application.recommendations, x, y, maxWidth);
      }
      if (photos.length > 0) {
        y = addSubHeading(doc, 'Fotografías de referencia', x, y);
        y = await renderApplicationPhotos(doc, photos, x, y);
      }
    }
  }

  if (safety) {
    const blocks: Array<[string, string | undefined]> = [
      ['Precauciones de manipulación', safety.handlingPrecautions],
      ['Limitaciones del esmalte', safety.glazeLimitations],
      ['Información sobre uso alimentario', safety.foodSafetyInfo],
      ['Observaciones de seguridad', safety.additionalSafetyNotes],
    ];
    const hasInfo =
      blocks.some(([, v]) => !!v) ||
      !!safety.foodContactStatus;
    if (hasInfo) {
      y = ensureSpace(doc, y, 10);
      y = addHeading(doc, '6. Seguridad y uso', x, y);
      for (const [title, value] of blocks) {
        if (value) {
          y = addSubHeading(doc, title, x, y);
          y = renderRichText(doc, value, x, y, maxWidth);
        }
      }
      if (safety.foodContactStatus) {
        y = renderKeyValues(
          doc,
          [{ label: 'Contacto alimentario:', value: safety.foodContactStatus }],
          x,
          y,
          maxWidth
        );
      }
    }
  }

  return y;
};

export const generateGlazePDF = async (glaze: Glaze) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(45, 52, 54);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(glaze.name, 15, 20);
  
  doc.setFontSize(10);
  doc.text(glaze.code, 15, 30);
  
  doc.setFontSize(8);
  doc.text(`Estado: ${STATUS_LABELS[glaze.status]}`, pageWidth - 15, 20, { align: 'right' });
  doc.text(`Autor: ${glaze.authorName}`, pageWidth - 15, 25, { align: 'right' });
  
  // Content
  doc.setTextColor(45, 52, 54);
  let yPos = 55;

  // Fotografías: imagen principal + galería completa
  const allPhotos = [glaze.mainImage, ...(glaze.gallery || [])].filter(Boolean) as string[];
  if (allPhotos.length > 0) {
    yPos = await renderPhotoGrid(doc, 'Fotografías', allPhotos, 15, yPos);
    yPos += 10;
  }

  // Technical Details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Detalles Técnicos', 15, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const details = [
    ['Color:', glaze.color],
    ['Acabado:', glaze.finish],
    ['Textura:', glaze.texture],
    ['Familia:', glaze.chemicalFamily],
    ['Temperatura:', glaze.temperature || 'N/A'],
    ['Atmósfera:', glaze.atmosphere || 'Oxidación']
  ];
  
  details.forEach(([label, value]) => {
    doc.text(label, 15, yPos);
    doc.text(value, 50, yPos);
    yPos += 7;
  });
  
  yPos = Math.max(yPos + 10, 110); // Ensure we don't overlap with image
  
  // Recipe
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Fórmula Técnica', 15, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.text('Composición Base', 15, yPos);
  doc.text('Cantidad', pageWidth - 40, yPos, { align: 'right' });
  yPos += 2;
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 7;
  
  doc.setFont('helvetica', 'normal');
  glaze.recipe.base.forEach(item => {
    doc.text(item.material, 15, yPos);
    doc.text(item.amount.toFixed(1), pageWidth - 40, yPos, { align: 'right' });
    yPos += 7;
  });
  
  doc.setFont('helvetica', 'bold');
  doc.text('Total Base', 15, yPos);
  doc.text(glaze.recipe.base.reduce((acc, i) => acc + i.amount, 0).toFixed(1), pageWidth - 40, yPos, { align: 'right' });
  yPos += 12;
  
  if (glaze.recipe.additional.length > 0) {
    doc.text('Adicionales', 15, yPos);
    yPos += 2;
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    glaze.recipe.additional.forEach(item => {
      doc.text(item.material, 15, yPos);
      doc.text(item.amount.toFixed(1), pageWidth - 40, yPos, { align: 'right' });
      yPos += 7;
    });
    yPos += 10;
  }
  
  // Observations
  if (glaze.observations) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones', 15, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitObs = doc.splitTextToSize(glaze.observations, pageWidth - 30);
    doc.text(splitObs, 15, yPos);
    yPos += splitObs.length * 5 + 10;
  }
  
  yPos = await renderTechSections(doc, glaze, yPos);
  
  const safeName = (glaze.name || 'Ficha').replace(/[\\/:*?"<>|]/g, '').trim();
  doc.save(`Ficha_${safeName}_${glaze.code}.pdf`);
};

export const generateBulkPDF = async (glazes: Glaze[]) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  for (let i = 0; i < glazes.length; i++) {
    const glaze = glazes[i];
    if (i > 0) doc.addPage();
    
    // Header
    doc.setFillColor(45, 52, 54);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text(glaze.name, 15, 20);
    
    doc.setFontSize(10);
    doc.text(glaze.code, 15, 30);
    
    doc.setFontSize(8);
    doc.text(`Estado: ${STATUS_LABELS[glaze.status]}`, pageWidth - 15, 20, { align: 'right' });
    doc.text(`Autor: ${glaze.authorName}`, pageWidth - 15, 25, { align: 'right' });
    
    // Content
    doc.setTextColor(45, 52, 54);
    let yPos = 55;

    // Image (if exists)
    if (glaze.mainImage) {
      try {
        const imgData = await getImageData(glaze.mainImage);
        doc.addImage(imgData, 'JPEG', pageWidth - 75, yPos, 60, 45);
      } catch (error) {
        console.error('Error adding image to PDF:', error);
      }
    }
    
    // Technical Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalles Técnicos', 15, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const details = [
      ['Color:', glaze.color],
      ['Acabado:', glaze.finish],
      ['Textura:', glaze.texture],
      ['Familia:', glaze.chemicalFamily],
      ['Temperatura:', glaze.temperature || 'N/A'],
      ['Atmósfera:', glaze.atmosphere || 'Oxidación']
    ];
    
    details.forEach(([label, value]) => {
      doc.text(label, 15, yPos);
      doc.text(value, 50, yPos);
      yPos += 7;
    });
    
    yPos = Math.max(yPos + 10, 110);
    
    // Recipe
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Fórmula Técnica', 15, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.text('Composición Base', 15, yPos);
    doc.text('Cantidad', pageWidth - 40, yPos, { align: 'right' });
    yPos += 2;
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 7;
    
    doc.setFont('helvetica', 'normal');
    glaze.recipe.base.forEach(item => {
      doc.text(item.material, 15, yPos);
      doc.text(item.amount.toFixed(1), pageWidth - 40, yPos, { align: 'right' });
      yPos += 7;
    });
    
    doc.setFont('helvetica', 'bold');
    doc.text('Total Base', 15, yPos);
    doc.text(glaze.recipe.base.reduce((acc, i) => acc + i.amount, 0).toFixed(1), pageWidth - 40, yPos, { align: 'right' });
    yPos += 12;
    
    if (glaze.recipe.additional.length > 0) {
      doc.text('Adicionales', 15, yPos);
      yPos += 2;
      doc.line(15, yPos, pageWidth - 15, yPos);
      yPos += 7;
      doc.setFont('helvetica', 'normal');
      glaze.recipe.additional.forEach(item => {
        doc.text(item.material, 15, yPos);
        doc.text(item.amount.toFixed(1), pageWidth - 40, yPos, { align: 'right' });
        yPos += 7;
      });
      yPos += 10;
    }
    
    // Observations
    if (glaze.observations) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones', 15, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const splitObs = doc.splitTextToSize(glaze.observations, pageWidth - 30);
      doc.text(splitObs, 15, yPos);
      yPos += splitObs.length * 5 + 10;
    }

    yPos = await renderTechSections(doc, glaze, yPos);
  }
  
  doc.save(`Exportacion_Esmaltes_${new Date().getTime()}.pdf`);
};