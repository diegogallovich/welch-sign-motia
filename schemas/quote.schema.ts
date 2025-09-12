import { z } from "zod";

export const ShopVoxQuoteSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  title: z.string(),
  description: z.string(),
  txnDate: z.string(),
  txnNumber: z.string(),
  totalPriceInDollars: z.string(),
  totalTaxInDollars: z.string(),
  totalPriceWithTaxInDollars: z.string(),
  workflowState: z.string(),
  expiryDate: z.string().nullable(),
  nextContactDate: z.string().nullable(),
  potentialClosingDate: z.string().nullable(),
  closingPotential: z.string(),
  customerPoNumber: z.string().nullable(),
  customerPoDate: z.string().nullable(),
  autoExpire: z.boolean(),
  downpaymentPercent: z.string(),
  shippingTracking: z.string().nullable(),
  shippingDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastNote: z.string().nullable(),
  age: z.number(),
  lastEmailedDate: z.string().nullable(),
  quoteFor: z.string().nullable(),
  customerNote: z.string().nullable(),
  site: z.string().nullable(),
  quickQuote: z.boolean(),
  dueDate: z.string().nullable(),
  inHandDate: z.string().nullable(),

  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
    initials: z.string()
  }),

  salesOrders: z.array(z.any()),

  primaryContact: z.object({
    id: z.string().uuid(),
    name: z.string(),
    primaryEmail: z.string().email(),
    phoneWithExt: z.string()
  }),

  primarySalesRep: z.object({
    id: z.string().uuid(), 
    name: z.string(),
    initials: z.string()
  }),

  company: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phoneWithExt: z.string().nullable()
  }),

  leadSourceId: z.string().uuid().nullable(),

  lineItems: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    descriptio: z.string(), // Note: This appears to be a typo in the original object
    fullDescription: z.string(),
    quantity: z.number(),
    volumeDiscountPercent: z.number(),
    volumeDiscountInDollars: z.number(),
    rangeDiscountPercent: z.number(),
    rangeDiscountInDollars: z.number(),
    uom: z.string(),
    costInDollars: z.number(),
    suggestedPriceInDollars: z.number(),
    priceInDollars: z.number(),
    totalPriceInDollars: z.number(),
    totalCostInDollars: z.number(),
    totalTaxInDollars: z.number(),
    workflowState: z.string(),
    saleType: z.string(),
    taxable: z.boolean(),
    taxName: z.string(),
    taxRate: z.number(),
    priceOverride: z.boolean(),
    incomeCoaAccountId: z.string().uuid(),
    incomeAccountName: z.string(),
    incomeAccountNumber: z.string(),
    cogCoaAccountId: z.string().uuid(),
    cogAccountName: z.string(),
    cogAccountNumber: z.string(),
    parentLineItemId: z.string().uuid().nullable()
  }))
});

export type ShopVoxQuote = z.infer<typeof ShopVoxQuoteSchema>;
