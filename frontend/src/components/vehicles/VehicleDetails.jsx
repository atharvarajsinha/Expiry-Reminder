import { Car, Fingerprint, ShieldCheck, User, Wind } from 'lucide-react';

import { DetailList, SectionCard } from './DetailList.jsx';
import { DocumentCard } from './DocumentCard.jsx';
import { Skeleton, SkeletonGroup } from '../common/Skeleton.jsx';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { categoryLabel } from '../../utils/vehicle.js';

/** `50` -> `50 CC`; keeps "Not available" for a missing value. */
function withUnit(value, unit) {
  if (value === null || value === undefined || value === '') return null;
  return `${value} ${unit}`;
}

/**
 * Every section of the vehicle detail page.
 *
 * Rendering is driven entirely by what the API returned - fields the upstream
 * service did not provide read "Not available" rather than being invented or
 * silently dropped.
 */
export function VehicleDetails({ vehicle }) {
  return (
    <div className="grid gap-4">
      <SectionCard icon={Car} title="Vehicle">
        <DetailList
          columns={3}
          items={[
            { label: 'Registration Number', value: vehicle.vehicleNo, mono: true },
            {
              label: 'Registration Date',
              value: vehicle.registrationDate ? (
                <time dateTime={vehicle.registrationDate}>
                  {formatDate(vehicle.registrationDate)}
                </time>
              ) : null,
            },
            { label: 'Category', value: categoryLabel(vehicle.category) },
            { label: 'Vehicle Class', value: vehicle.vehicleClass },
            { label: 'Maker', value: vehicle.maker },
            { label: 'Model', value: vehicle.model },
            { label: 'Fuel', value: vehicle.fuel },
            { label: 'Cubic Capacity', value: withUnit(vehicle.cubicCapacity, 'CC') },
            { label: 'Seats', value: vehicle.seatCapacity },
            { label: 'Wheelbase', value: withUnit(vehicle.wheelbase, 'mm') },
            {
              label: 'Fitness Upto',
              value: vehicle.fitnessUpto ? formatDate(vehicle.fitnessUpto) : null,
            },
            {
              label: 'Tax Upto',
              value: vehicle.taxUpto ? formatDate(vehicle.taxUpto) : null,
            },
            { label: 'Registered At', value: vehicle.registeredAt },
          ]}
        />
      </SectionCard>

      <SectionCard icon={User} title="Owner">
        <DetailList
          items={[
            { label: 'Owner Name', value: vehicle.ownerName },
            { label: 'Father Name', value: vehicle.fatherName },
          ]}
        />
      </SectionCard>

      <SectionCard icon={Fingerprint} title="Identification">
        <DetailList
          items={[
            { label: 'Chassis Number', value: vehicle.chassisNo, mono: true },
            { label: 'Engine Number', value: vehicle.engineNo, mono: true },
          ]}
        />
      </SectionCard>

      <DocumentCard
        icon={ShieldCheck}
        title="Insurance"
        document={vehicle.insurance}
        fields={[
          { label: 'Company', value: vehicle.insurance?.company },
          { label: 'Policy Number', value: vehicle.insurance?.policyNo, mono: true },
        ]}
      />

      <DocumentCard
        icon={Wind}
        title="PUC"
        document={vehicle.pucc}
        fields={[
          {
            label: 'Certificate Number',
            value: vehicle.pucc?.certificateNo,
            mono: true,
          },
        ]}
      />

      <p className="px-1 text-xs text-slate-400 dark:text-slate-500">
        Added {formatDateTime(vehicle.createdAt, 'unknown')} · last fetched{' '}
        {formatDateTime(vehicle.lastFetchedAt, 'never')}
      </p>
    </div>
  );
}

export function VehicleDetailsSkeleton() {
  return (
    <SkeletonGroup label="Loading vehicle details" className="grid gap-4">
      {[3, 2, 2, 3, 2].map((rows, index) => (
        <div key={index} className="surface p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <Skeleton className="h-8 w-8" rounded="rounded-lg" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: rows * 2 }).map((_, cell) => (
              <div key={cell} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
