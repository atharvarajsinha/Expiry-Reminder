/**
 * Vehicle endpoints, plus the one place where the backend's snake_case
 * payloads are translated into the shape the components use. Keeping the
 * mapping here means a backend field rename touches this file only.
 *
 * Two payload shapes exist and they are not interchangeable:
 *
 *  - the *summary* from `GET /vehicles/` has flat expiry fields and
 *    deliberately omits owner, chassis, engine and policy numbers;
 *  - the *detail* from `GET /vehicles/{id}/` nests `insurance` / `pucc` and
 *    includes the identification fields.
 *
 * Both are mapped to the same nested `insurance` / `pucc` sub-objects so
 * `resolveDocumentStatus` and `<DocumentStatus>` work with either one.
 */
import { client, unwrap } from './client.js';

/** `GET /api/vehicles/` list item. */
export function mapVehicleSummary(raw) {
  return {
    id: raw.id,
    vehicleNo: raw.vehicle_no,
    maker: raw.maker,
    model: raw.model,
    category: raw.vehicle_category,
    insurance: {
      expiresOn: raw.insurance_expires_on,
      status: raw.insurance_status,
      daysRemaining: raw.insurance_days_remaining,
      // The list endpoint does not expose company or policy number.
    },
    pucc: {
      expiresOn: raw.pucc_expires_on,
      status: raw.pucc_status,
      daysRemaining: raw.pucc_days_remaining,
    },
    overallStatus: raw.overall_status,
    lastFetchedAt: raw.last_fetched_at,
    updatedAt: raw.updated_at,
  };
}

/** `GET /api/vehicles/{id}/` full record. */
export function mapVehicleDetail(raw) {
  return {
    id: raw.id,
    vehicleNo: raw.vehicle_no,
    registrationDate: raw.registration_date,
    registeredAt: raw.registered_at,

    insurance: {
      company: raw.insurance?.company ?? null,
      policyNo: raw.insurance?.policy_no ?? null,
      expiresOn: raw.insurance?.expires_on ?? null,
      status: raw.insurance?.status ?? null,
      statusLabel: raw.insurance?.status_label ?? null,
      daysRemaining: raw.insurance?.days_remaining ?? null,
    },
    pucc: {
      certificateNo: raw.pucc?.certificate_no ?? null,
      expiresOn: raw.pucc?.expires_on ?? null,
      status: raw.pucc?.status ?? null,
      statusLabel: raw.pucc?.status_label ?? null,
      daysRemaining: raw.pucc?.days_remaining ?? null,
    },

    category: raw.vehicle_category,
    vehicleClass: raw.vehicle_class,
    chassisNo: raw.chassis_no,
    engineNo: raw.engine_no,
    cubicCapacity: raw.cubic_capacity,
    maker: raw.maker,
    model: raw.model,
    ownerName: raw.owner_name,
    fatherName: raw.father_name,
    fuel: raw.fuel,
    wheelbase: raw.wheelbase,
    seatCapacity: raw.seat_capacity,
    fitnessUpto: raw.fitness_upto,
    taxUpto: raw.tax_upto,

    overallStatus: raw.overall_status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastFetchedAt: raw.last_fetched_at,
  };
}

/** `GET /api/vehicles/` */
export async function getVehicles() {
  const data = unwrap(await client.get('/vehicles/'));
  return Array.isArray(data) ? data.map(mapVehicleSummary) : [];
}

/** `GET /api/vehicles/{id}/` */
export async function getVehicle(id) {
  return mapVehicleDetail(unwrap(await client.get(`/vehicles/${encodeURIComponent(id)}/`)));
}

/**
 * `POST /api/vehicles/fetch/`
 *
 * Answers 202 immediately with a job to poll - it never waits for the upstream
 * vehicle service. A 409 (VEHICLE_ALREADY_EXISTS) carries the existing
 * vehicle id in `error.details.vehicle_id`.
 */
export async function fetchVehicle(vehicleNo) {
  const data = unwrap(await client.post('/vehicles/fetch/', { vehicle_no: vehicleNo }));
  return {
    jobId: data.job_id,
    vehicleNo: data.vehicle_no,
    status: data.status,
  };
}

/** `POST /api/vehicles/{id}/refresh/` - also asynchronous. */
export async function refreshVehicle(id) {
  const data = unwrap(
    await client.post(`/vehicles/${encodeURIComponent(id)}/refresh/`, {}),
  );
  return {
    jobId: data.job_id,
    vehicleNo: data.vehicle_no,
    vehicleId: data.vehicle_id,
    status: data.status,
  };
}

/** `DELETE /api/vehicles/{id}/` */
export async function deleteVehicle(id) {
  await client.delete(`/vehicles/${encodeURIComponent(id)}/`);
  return true;
}
