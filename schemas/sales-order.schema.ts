import { z } from "zod";

export const ShopVoxSalesOrderLineItemSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  companyId: z.string().uuid(),
  position: z.number(),
  name: z.string(),
  description: z.string(),
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
  priceOverride: z.string(),
  incomeCoaAccountId: z.string().uuid(),
  incomeAccountName: z.string(),
  incomeAccountNumber: z.string(),
  workOrderTxnNumber: z.string(),
  cogCoaAccountId: z.string().uuid(),
  cogAccountName: z.string(),
  cogAccountNumber: z.string(),
  parentLineItemId: z.string().uuid().nullable(),
  purchaseOrderLineItems: z.array(z.any()),
  purchaseTrackings: z.array(z.any()),
  incomeAccountEditMode: z.string(),
  cogAccountEditMode: z.string()
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
  active: z.string(),
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
  shippingDate: z.string().nullable(),
  customerPoNumber: z.string().nullable(),
  customerPoDate: z.string().nullable(),
  downpaymentPercent: z.string(),
  lastInvoicedAt: z.string(),
  lastInvoicedOn: z.string(),
  invoiced: z.boolean(),
  fullyInvoiced: z.boolean(),
  primarySalesRepInitials: z.string(),
  companyId: z.string().uuid(),
  primarySalesRepId: z.string().uuid(),
  primaryContactId: z.string().uuid(),
  billingAddressId: z.string().uuid().nullable(),
  shippingAddressId: z.string().uuid().nullable(),
  termCodeId: z.string().uuid(),
  salesTaxId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  shippingMethodId: z.string().uuid().nullable(),
  productionManagerId: z.string().uuid().nullable(),
  projectManagerId: z.string().uuid().nullable(),
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

  lineItems: z.array(ShopVoxSalesOrderLineItemSchema),

  pm: z.object({
    id: z.string().uuid(),
    initials: z.string(),
    name: z.string()
  }),

  projectManager: z.object({
    id: z.string().uuid(),
    initials: z.string(),
    name: z.string()
  }),

  estimator: z.object({
    id: z.string().uuid(),
    name: z.string(),
    initials: z.string()
  }),

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
    code: z.string().nullable()
  }),

  primaryContact: z.object({
    id: z.string().uuid(),
    name: z.string(),
    title: z.string(),
    email: z.string(),
    phoneWithExt: z.string().nullable()
  }),

  primarySalesRep: z.object({
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
