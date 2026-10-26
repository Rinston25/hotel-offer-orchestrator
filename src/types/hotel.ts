export const SUPPLIER_IDS = ['supplierA', 'supplierB'] as const;
export type SupplierId = (typeof SUPPLIER_IDS)[number];

/** Human readable supplier name used in API responses. */
export const SUPPLIER_LABELS: Record<SupplierId, string> = {
  supplierA: 'Supplier A',
  supplierB: 'Supplier B',
};

/** A hotel exactly as a supplier returns it. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** A supplier hotel tagged with the supplier it came from. */
export interface HotelOffer extends SupplierHotel {
  supplier: string;
}

export interface PriceRange {
  minPrice?: number;
  maxPrice?: number;
}

/** What the Temporal workflow hands back to the API. */
export interface OfferWorkflowResult {
  offers: HotelOffer[];
  degradedSuppliers: SupplierId[];
}

/** Public shape of one entry in GET /api/hotels. */
export interface HotelResponse {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}
