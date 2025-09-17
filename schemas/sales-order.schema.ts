import { z } from "zod";

export const ShopVoxSalesOrderLineItemSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  companyId: z.string().uuid(),
  position: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  fullDescription: z.string(),
  quantity: z.string(),
  volumeDiscountPercent: z.string(),
  volumeDiscountInDollars: z.string(),
  rangeDiscountPercent: z.string(),
  rangeDiscountInDollars: z.string(),
  uom: z.string(),
  costInDollars: z.string(),
  suggestedPriceInDollars: z.string(),
  priceInDollars: z.string(),
  totalCostInDollars: z.string(),
  totalPriceInDollars: z.string(),
  totalTaxInDollars: z.string(),
  workflowState: z.string(),
  productId: z.string().uuid(),
  productType: z.string(),
  productName: z.string(),
  saleType: z.string(),
  jobId: z.string().uuid().nullable(),
  taxable: z.boolean(),
  taxName: z.string(),
  taxRate: z.string(),
  priceOverride: z.boolean(),
  incomeCoaAccountId: z.string().uuid(),
  incomeAccountName: z.string(),
  incomeAccountNumber: z.string(),
  workOrderTxnNumber: z.string(),
  cogCoaAccountId: z.string().uuid(),
  cogAccountName: z.string(),
  cogAccountNumber: z.string(),
  parentLineItemId: z.string().uuid().nullable(),
  customFields: z.array(z.any()),
  purchaseOrderLineItems: z.array(z.any()),
  purchaseTrackings: z.array(z.any()),
  lineItemPricing: z.object({
    pricingType: z.string(),
    id: z.string().uuid(),
    useTemplate: z.boolean()
  }),
  incomeAccountEditMode: z.boolean(),
  cogAccountEditMode: z.boolean()
});

export const ShopVoxSignatureSchema = z.object({
  name: z.string(),
  location: z.string(),
  signatureUrl: z.string().url(),
  createdAt: z.string()
});

export const ShopVoxRelatedTransactionSchema = z.object({
  txnId: z.string().uuid(),
  txnNumber: z.string(),
  txnDate: z.string(),
  txnName: z.string(),
  txnType: z.string(),
  txnTotal: z.string()
});

export const ShopVoxSalesOrderSchema = z.object({
  className: z.string(),
  active: z.boolean(),
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  txnDate: z.string(),
  txnNumber: z.string(),
  totalPriceInDollars: z.string(),
  totalTaxInDollars: z.string(),
  totalPriceWithTaxInDollars: z.string(),
  totalPaymentsInDollars: z.string(),
  balanceInDollars: z.string(),
  workflowState: z.string(),
  dueDate: z.string(),
  inHandDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  customerPoNumber: z.string().nullable(),
  customerPoDate: z.string().nullable(),
  downpaymentPercent: z.string(),
  lastInvoicedAt: z.string().nullable(),
  lastInvoicedOn: z.string().nullable(),
  invoiced: z.boolean(),
  fullyInvoiced: z.boolean(),
  primarySalesRepInitials: z.string(),
  setupChargesInDollars: z.string(),
  setupChargesTaxable: z.boolean(),
  setupChargesIsPercent: z.boolean(),
  setupChargesPercent: z.string(),
  setupChargesTaxInDollars: z.string(),
  miscChargesInDollars: z.string(),
  miscChargesTaxable: z.boolean(),
  miscChargesLabel: z.string().nullable(),
  miscChargesIsPercent: z.boolean(),
  miscChargesPercent: z.string(),
  miscChargesTaxInDollars: z.string(),
  shippingChargesInDollars: z.string(),
  shippingChargesTaxable: z.boolean(),
  shippingChargesIsPercent: z.boolean(),
  shippingChargesPercent: z.string(),
  shippingChargesTaxInDollars: z.string(),
  financeChargesInDollars: z.string(),
  financeChargesTaxable: z.boolean(),
  financeChargesIsPercent: z.boolean(),
  financeChargesPercent: z.string(),
  financeChargesTaxInDollars: z.string(),
  companyId: z.string().uuid(),
  primarySalesRepId: z.string().uuid(),
  primaryContactId: z.string().uuid(),
  billingAddressId: z.string().uuid().nullable(),
  shippingAddressId: z.string().uuid().nullable(),
  termCodeId: z.string().uuid(),
  salesTaxId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdById: z.string().uuid(),
  updatedById: z.string().uuid(),
  shippingMethodId: z.string().uuid().nullable(),
  productionManagerId: z.string().uuid().nullable(),
  projectManagerId: z.string().uuid().nullable(),
  paymentMethodId: z.string().uuid().nullable(),

  lineItems: z.array(ShopVoxSalesOrderLineItemSchema),

  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phoneWithExt: z.string().nullable(),
    specialNotes: z.string().nullable()
  }),

  termCode: z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.string(),
    days: z.number()
  }),

  tax: z.object({
    id: z.string().uuid(),
    name: z.string(),
    rate: z.string(),
    rateInPercent: z.string(),
    agency: z.string(),
    code: z.string(),
    hasSplit: z.boolean(),
    taxSplit: z.object({}),
    taxSplitStr: z.string()
  }),

  primaryContact: z.object({
    id: z.string().uuid(),
    name: z.string(),
    title: z.string().nullable(),
    email: z.string(),
    phoneWithExt: z.string().nullable()
  }),

  primarySalesRep: z.object({
    id: z.string().uuid(),
    name: z.string(),
    initials: z.string()
  }),

  productionManager: z.object({
    id: z.string().uuid(),
    name: z.string(),
    initials: z.string()
  }),

  projectManager: z.object({
    id: z.string().uuid(),
    name: z.string(),
    initials: z.string()
  }),

  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),

  updatedBy: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),

  billingAddress: z.object({
    id: z.string().uuid(),
    name: z.string(),
    nameStreet: z.string(),
    street: z.string(),
    street1: z.string().nullable(),
    suburb: z.string(),
    city: z.string(),
    nameStreetCity: z.string(),
    zip: z.string(),
    state: z.string(),
    country: z.string(),
    countryCode: z.string(),
    attentionTo: z.string()
  }),

  shippingAddress: z.object({
    id: z.string().uuid(),
    name: z.string(),
    nameStreet: z.string(),
    street: z.string(),
    street1: z.string().nullable(),
    suburb: z.string(),
    city: z.string(),
    nameStreetCity: z.string(),
    zip: z.string(),
    state: z.string(),
    country: z.string(),
    countryCode: z.string(),
    attentionTo: z.string()
  }),

  relatedTransactions: z.array(ShopVoxRelatedTransactionSchema),
  orderPayments: z.array(z.any()),
  purchaseOrderLineItemsTotalPriceInDollars: z.number(),
  purchaseOrders: z.array(z.any()),
  signatures: z.array(ShopVoxSignatureSchema)
});

export type ShopVoxSalesOrder = z.infer<typeof ShopVoxSalesOrderSchema>;
export type ShopVoxSalesOrderLineItem = z.infer<typeof ShopVoxSalesOrderLineItemSchema>;
export type ShopVoxSignature = z.infer<typeof ShopVoxSignatureSchema>;
export type ShopVoxRelatedTransaction = z.infer<typeof ShopVoxRelatedTransactionSchema>;
