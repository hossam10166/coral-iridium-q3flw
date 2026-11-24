import React, { useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  BedDouble,
  Building2,
  Bus,
  FileCheck2,
  Layers,
  Plane,
  PlaneLanding,
  UserCheck,
  Users,
} from 'lucide-react';
import { UmrahModuleTab, UmrahSharedProps } from './umrah1448/umrahShared';
import { UmrahAgentsGroupsTab } from './umrah1448/UmrahAgentsGroupsTab';
import { UmrahPilgrimsVisasTab } from './umrah1448/UmrahPilgrimsVisasTab';
import { UmrahFlightsArrivalTab } from './umrah1448/UmrahFlightsArrivalTab';
import { UmrahHotelsRoomsTab } from './umrah1448/UmrahHotelsRoomsTab';
import { UmrahTransportStaffTab } from './umrah1448/UmrahTransportStaffTab';
import { UmrahReportsArchiveTab } from './umrah1448/UmrahReportsArchiveTab';
import { bi } from '../../i18n/translations';

interface TabDef {
  id: UmrahModuleTab;
  ar: string;
  en: string;
  icon: React.FC<{ className?: string }>;
}

const MODULE_TABS: TabDef[] = [
  { id: 'agents', ar: 'الشركات والوكلاء', en: 'Agents & Partners', icon: Building2 },
  { id: 'groups', ar: 'مجموعات العمرة والحج', en: 'Umrah & Hajj Groups', icon: Layers },
  { id: 'pilgrims', ar: 'المعتمرون والجوازات', en: 'Pilgrims & Passports', icon: Users },
  { id: 'visas', ar: 'إدارة التأشيرات', en: 'Visas & Issuance', icon: FileCheck2 },
  { id: 'flights', ar: 'الرحلات والطيران', en: 'Flights & Airlines', icon: Plane },
  { id: 'hotels', ar: 'الفنادق والغرف', en: 'Hotels & Rooms', icon: BedDouble },
  { id: 'transport', ar: 'الحافلات والنقل', en: 'Buses & Transport', icon: Bus },
  { id: 'staff', ar: 'المشرفون والمناديب', en: 'Supervisors & Delegates', icon: UserCheck },
  { id: 'arrivals', ar: 'الوصول والمغادرة', en: 'Arrival & Departure', icon: PlaneLanding },
  { id: 'reports', ar: 'التقارير المالية والتشغيل', en: 'Financial & Ops Reports', icon: BarChart3 },
  { id: 'archive', ar: 'الأرشيف الكامل', en: 'Full Archive', icon: Archive },
];

export const UmrahVisa1448Page: React.FC<UmrahSharedProps> = (props) => {
  const { db, lang } = props;
  const [activeTab, setActiveTab] = useState<UmrahModuleTab>('agents');

  const counts = useMemo(
    () => ({
      agents: (db.umrahAgents || []).length,
      groups: (db.umrahGroups || []).length,
      pilgrims: (db.umrahPilgrims || []).length,
      issuedVisas: (db.umrahPilgrims || []).filter((p) => p.visaStatus === 'issued').length,
      flights: (db.umrahFlights || []).length,
      transports: db.transports.length,
      staff: (db.umrahFieldStaff || []).length,
      inKsa: (db.umrahPilgrims || []).filter((p) => p.arrivalStatus === 'arrived').length,
    }),
    [db]
  );

  return (
    <div className="space-y-4">
      {/* Season 1448 Summary Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {bi(lang, 'منظومة إدارة تأشيرة العمرة والحج — موسم 1448 هـ', 'Umrah & Hajj Visa Management Suite — Season 1448H')}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {bi(
              lang,
              'إدارة متكاملة للشركات، المجموعات، الجوازات، التأشيرات، الطيران، تسكين الفنادق، الحافلات، المشرفين، الوصول والمغادرة، التقارير والأرشيف',
              'Integrated workspace for agents, groups, passports, visas, flights, rooming, buses, field staff, arrivals, reports, and archive'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 font-mono-num">
          <span>
            {bi(lang, 'الوكلاء:', 'Agents:')} <strong className="text-slate-900">{counts.agents}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {bi(lang, 'المجموعات:', 'Groups:')} <strong className="text-slate-900">{counts.groups}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {bi(lang, 'المعتمرون:', 'Pilgrims:')} <strong className="text-[#1d4ed8]">{counts.pilgrims}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {bi(lang, 'تأشيرات صادرة:', 'Issued:')} <strong className="text-[#0f766e]">{counts.issuedVisas}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {bi(lang, 'داخل المملكة:', 'In KSA:')} <strong className="text-amber-700">{counts.inKsa}</strong>
          </span>
        </div>
      </div>

      {/* 11 Interactive Module Tabs */}
      <div className="no-print bg-white border border-slate-200 rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {MODULE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#1d4ed8] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'ar' ? tab.ar : tab.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Module View */}
      {activeTab === 'agents' && <UmrahAgentsGroupsTab mode="agents" {...props} />}
      {activeTab === 'groups' && <UmrahAgentsGroupsTab mode="groups" {...props} />}
      {activeTab === 'pilgrims' && <UmrahPilgrimsVisasTab mode="pilgrims" {...props} />}
      {activeTab === 'visas' && <UmrahPilgrimsVisasTab mode="visas" {...props} />}
      {activeTab === 'flights' && <UmrahFlightsArrivalTab mode="flights" {...props} />}
      {activeTab === 'hotels' && <UmrahHotelsRoomsTab {...props} />}
      {activeTab === 'transport' && <UmrahTransportStaffTab mode="transport" {...props} />}
      {activeTab === 'staff' && <UmrahTransportStaffTab mode="staff" {...props} />}
      {activeTab === 'arrivals' && <UmrahFlightsArrivalTab mode="arrivals" {...props} />}
      {activeTab === 'reports' && <UmrahReportsArchiveTab mode="reports" {...props} />}
      {activeTab === 'archive' && <UmrahReportsArchiveTab mode="archive" {...props} />}
    </div>
  );
};
