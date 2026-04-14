import jsPDF from 'jspdf';
import { Glaze } from '../types';
import { STATUS_LABELS } from '../constants';

const getImageData = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
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
  }
  
  doc.save(`Ficha_${glaze.code}.pdf`);
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
    }
  }
  
  doc.save(`Exportacion_Esmaltes_${new Date().getTime()}.pdf`);
};

