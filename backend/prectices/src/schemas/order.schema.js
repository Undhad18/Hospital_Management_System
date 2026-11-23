const createOrderSchema = z.object({
    items: z
        .array(
            z.object({
                productId: z.string().min(1),
                quantity: z
                    .number()
                    .int()
                    .positive()
            })
        )
        .min(1),

    shippingAddress: z.object({
        addressLine1: z.string().min(3),
        city: z.string().min(2),
        state: z.string().min(2),
        postalCode: z.string().min(4).max(10),
        country: z.string().min(2)
    })
});