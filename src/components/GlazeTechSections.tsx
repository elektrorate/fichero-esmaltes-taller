import { ClipboardList, FlaskConical, Flame, Microscope, Brush, ShieldCheck } from 'lucide-react';
import { Glaze } from '../types';
import RichText from './RichText';
import { cn } from '../lib/utils';

const hasAny = (...values: Array<string | number | undefined | string[] | undefined>) =>
  values.some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '';
  });

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">{children}</p>;
}

function TextValue({ children }: { children: React.ReactNode }) {
  return <div className="mt-0.5 text-sm leading-relaxed text-[#2D3436]">{children}</div>;
}

function RichValue({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <div className="mt-0.5 text-sm leading-relaxed text-[#2D3436]">
      <RichText>{children}</RichText>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] bg-white p-8 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#F4F4F2] pb-5">
        <Icon size={18} className="text-[#8a168a]" />
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

function FieldPair({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <SubLabel>{label}</SubLabel>
      <TextValue>{value}</TextValue>
    </div>
  );
}

export default function GlazeTechSections({ glaze }: { glaze: Glaze }) {
  const { techSpecs, preparation, firingCurve, analysis, application, safety } = glaze;
  const sections: Array<{ id: string; show: boolean; node: React.ReactNode }> = [];

  if (techSpecs) {
    sections.push({
      id: 'specs',
      show: hasAny(
        techSpecs.cone,
        techSpecs.targetTemperature,
        techSpecs.atmosphere,
        techSpecs.clayBodyType,
        techSpecs.applicationMethods,
        techSpecs.characteristics
      ),
      node: (
        <Section icon={ClipboardList} title="Ficha técnica">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {techSpecs.cone && (
              <FieldPair label="Cono Orton" value={`Cono ${techSpecs.cone}`} />
            )}
            {techSpecs.targetTemperature !== undefined && (
              <FieldPair label="Temperatura orientativa" value={`${techSpecs.targetTemperature}°C`} />
            )}
            {techSpecs.atmosphere && <FieldPair label="Atmósfera" value={techSpecs.atmosphere} />}
            {techSpecs.clayBodyType && <FieldPair label="Tipo de pasta" value={techSpecs.clayBodyType} />}
            {(techSpecs.applicationMethods?.length || 0) > 0 && (
              <FieldPair label="Método de aplicación" value={techSpecs.applicationMethods?.join(', ')} />
            )}
          </div>
          {techSpecs.characteristics && (
            <div>
              <SubLabel>Características principales</SubLabel>
              <RichValue>{techSpecs.characteristics}</RichValue>
            </div>
          )}
        </Section>
      ),
    });
  }

  if (preparation) {
    sections.push({
      id: 'preparation',
      show: hasAny(
        preparation.mixingOrder,
        preparation.initialWater,
        preparation.sieving,
        preparation.resting,
        preparation.suspensionTips
      ),
      node: (
        <Section icon={FlaskConical} title="Preparación">
          {preparation.mixingOrder && (
            <div>
              <SubLabel>Orden de mezclado</SubLabel>
              <RichValue>{preparation.mixingOrder}</RichValue>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {preparation.initialWater && (
              <FieldPair label="Agua inicial (orientativa)" value={preparation.initialWater} />
            )}
            {preparation.sieving && <FieldPair label="Tamizado" value={preparation.sieving} />}
            {preparation.resting && <FieldPair label="Reposo" value={preparation.resting} />}
          </div>
          {preparation.suspensionTips && (
            <div>
              <SubLabel>Recomendaciones para una suspensión adecuada</SubLabel>
              <RichValue>{preparation.suspensionTips}</RichValue>
            </div>
          )}
        </Section>
      ),
    });
  }

  const segments = firingCurve?.segments || [];
  if (firingCurve) {
    sections.push({
      id: 'curve',
      show: hasAny(
        firingCurve.name,
        firingCurve.program,
        firingCurve.finalTemperature,
        firingCurve.finalSoak,
        firingCurve.cooling,
        firingCurve.essentialParameters,
        firingCurve.additionalNotes
      ) || segments.length > 0,
      node: (
        <Section icon={Flame} title="Curva de cocción">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {firingCurve.name && <FieldPair label="Referencia de la curva" value={firingCurve.name} />}
            {firingCurve.program && <FieldPair label="Programa utilizado" value={firingCurve.program} />}
            {firingCurve.finalTemperature !== undefined && (
              <FieldPair label="Temperatura final" value={`${firingCurve.finalTemperature}°C`} />
            )}
            {firingCurve.finalSoak !== undefined && (
              <FieldPair
                label="Meseta final"
                value={`${firingCurve.finalSoak} ${firingCurve.finalSoakUnit || 'min'}`}
              />
            )}
          </div>
          {firingCurve.cooling && (
            <div>
              <SubLabel>Enfriamiento</SubLabel>
              <RichValue>{firingCurve.cooling}</RichValue>
            </div>
          )}
          {firingCurve.essentialParameters && (
            <div>
              <SubLabel>Parámetros esenciales para el resultado</SubLabel>
              <RichValue>{firingCurve.essentialParameters}</RichValue>
            </div>
          )}
          {firingCurve.additionalNotes && (
            <div>
              <SubLabel>Observaciones adicionales</SubLabel>
              <TextValue>{firingCurve.additionalNotes}</TextValue>
            </div>
          )}
          {segments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[#E4E4E2] text-left text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                    <th className="py-2 pr-4">Segmento</th>
                    <th className="py-2 pr-4">Velocidad</th>
                    <th className="py-2 pr-4">T° objetivo</th>
                    <th className="py-2 pr-4">Meseta</th>
                    <th className="py-2">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F2]">
                  {segments.map((seg) => (
                    <tr key={seg.index}>
                      <td className="py-2.5 pr-4 font-mono font-semibold">{seg.index}</td>
                      <td className="py-2.5 pr-4 font-mono">
                        {seg.rate !== undefined ? `${seg.rate} °C/h` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono">
                        {seg.targetTemperature !== undefined ? `${seg.targetTemperature} °C` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono">
                        {seg.soak !== undefined && seg.soak !== 0 ? `${seg.soak} ${seg.soakUnit || 'min'}` : '—'}
                      </td>
                      <td className="py-2.5 text-[#636E72]">{seg.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ),
    });
  }

  if (analysis) {
    sections.push({
      id: 'analysis',
      show: hasAny(
        analysis.chemicalBehavior,
        analysis.rawMaterialFunctions,
        analysis.defects,
        analysis.adjustments,
        analysis.generalNotes
      ),
      node: (
        <Section icon={Microscope} title="Análisis y observaciones">
          {analysis.chemicalBehavior && (
            <div>
              <SubLabel>Comportamiento químico del esmalte</SubLabel>
              <RichValue>{analysis.chemicalBehavior}</RichValue>
            </div>
          )}
          {analysis.rawMaterialFunctions && (
            <div>
              <SubLabel>Función de las materias primas</SubLabel>
              <RichValue>{analysis.rawMaterialFunctions}</RichValue>
            </div>
          )}
          {analysis.defects && (
            <div>
              <SubLabel>Defectos observados</SubLabel>
              <RichValue>{analysis.defects}</RichValue>
            </div>
          )}
          {analysis.adjustments && (
            <div>
              <SubLabel>Posibles ajustes</SubLabel>
              <RichValue>{analysis.adjustments}</RichValue>
            </div>
          )}
          {analysis.generalNotes && (
            <div>
              <SubLabel>Observaciones generales</SubLabel>
              <RichValue>{analysis.generalNotes}</RichValue>
            </div>
          )}
        </Section>
      ),
    });
  }

  const photos = application?.photos || [];
  if (application) {
    sections.push({
      id: 'application',
      show: hasAny(
        application.layers,
        application.techniques,
        application.behaviorOnClays,
        application.recommendations
      ) || photos.length > 0,
      node: (
        <Section icon={Brush} title="Aplicación">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {application.layers && (
              <FieldPair label="Capas / espesor recomendado" value={application.layers} />
            )}
            {(application.techniques?.length || 0) > 0 && (
              <FieldPair label="Técnicas utilizadas" value={application.techniques?.join(', ')} />
            )}
          </div>
          {application.behaviorOnClays && (
            <div>
              <SubLabel>Comportamiento sobre diferentes pastas</SubLabel>
              <RichValue>{application.behaviorOnClays}</RichValue>
            </div>
          )}
          {application.recommendations && (
            <div>
              <SubLabel>Recomendaciones de aplicación</SubLabel>
              <RichValue>{application.recommendations}</RichValue>
            </div>
          )}
          {photos.length > 0 && (
            <div>
              <SubLabel>Fotografías de referencia ({photos.length})</SubLabel>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo, idx) => (
                  <figure key={idx}>
                    <div className="overflow-hidden rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5]">
                      <img
                        src={photo.url}
                        alt={photo.caption || `Referencia ${idx + 1}`}
                        className="aspect-[4/3] w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {photo.caption && (
                      <figcaption className="mt-1.5 text-xs text-[#636E72]">{photo.caption}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          )}
        </Section>
      ),
    });
  }

  if (safety) {
    sections.push({
      id: 'safety',
      show: hasAny(
        safety.handlingPrecautions,
        safety.glazeLimitations,
        safety.foodSafetyInfo,
        safety.foodContactStatus,
        safety.additionalSafetyNotes
      ),
      node: (
        <Section icon={ShieldCheck} title="Seguridad y uso">
          {safety.handlingPrecautions && (
            <div>
              <SubLabel>Precauciones de manipulación</SubLabel>
              <RichValue>{safety.handlingPrecautions}</RichValue>
            </div>
          )}
          {safety.glazeLimitations && (
            <div>
              <SubLabel>Limitaciones del esmalte</SubLabel>
              <RichValue>{safety.glazeLimitations}</RichValue>
            </div>
          )}
          {safety.foodSafetyInfo && (
            <div>
              <SubLabel>Información sobre uso alimentario</SubLabel>
              <RichValue>{safety.foodSafetyInfo}</RichValue>
            </div>
          )}
          {safety.foodContactStatus && (
            <div>
              <SubLabel>Estado de verificación para contacto alimentario</SubLabel>
              <span
                className={cn(
                  'mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                  safety.foodContactStatus === 'Evaluado mediante ensayos'
                    ? 'bg-emerald-100 text-emerald-700'
                    : safety.foodContactStatus === 'No recomendado para contacto alimentario'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                )}
              >
                {safety.foodContactStatus}
              </span>
            </div>
          )}
          {safety.additionalSafetyNotes && (
            <div>
              <SubLabel>Observaciones de seguridad adicionales</SubLabel>
              <RichValue>{safety.additionalSafetyNotes}</RichValue>
            </div>
          )}
        </Section>
      ),
    });
  }

  const visibleSections = sections.filter((s) => s.show);
  if (visibleSections.length === 0) return null;

  return (
    <div className="space-y-6">
      {visibleSections.map((s) => (
        <div key={s.id}>{s.node}</div>
      ))}
    </div>
  );
}