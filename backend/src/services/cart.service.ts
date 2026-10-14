import { prisma } from "../lib/prisma";

interface AddToCartData {
  userId: string;
  productId: string;
  quantity: number;
}

// Vérifie qu'un produit est achetable et que la quantité totale demandée est en stock.
// C'est un contrôle de confort : le contrôle définitif a lieu à la création de la commande.
async function assertAvailable(
  product: { id: string; name: string; isActive: boolean; type: string },
  totalQuantity: number
) {
  if (!product.isActive) {
    throw new Error(`Le produit « ${product.name} » n'est plus disponible`);
  }

  if (product.type === "LOCAL") {
    const inventory = await prisma.inventory.findUnique({
      where: { productId: product.id },
      select: { quantity: true },
    });
    const available = inventory?.quantity ?? 0;

    if (totalQuantity > available) {
      throw new Error(
        available > 0
          ? `Stock insuffisant pour « ${product.name} » : ${available} disponible(s)`
          : `« ${product.name} » est en rupture de stock`
      );
    }
  }
}

export async function addToCart(data: AddToCartData) {
  const { userId, productId, quantity } = data;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La quantité doit être un entier supérieur à 0");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error("Produit introuvable");
  }

  let cart = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
    });
  }

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  await assertAvailable(product, (existingItem?.quantity ?? 0) + quantity);

  if (existingItem) {
    return prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: existingItem.quantity + quantity },
    });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity,
    },
  });
}

export async function getCartByUser(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      },
    },
  });

  if (!cart) {
    throw new Error("Panier introuvable");
  }

  return cart;
}

// Update cart item quantity
export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
  userId: string
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La quantité doit être un entier supérieur à 0");
  }

  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cart: { userId },
    },
    include: { product: true },
  });

  if (!item) {
    throw new Error("Article introuvable ou accès refusé");
  }

  await assertAvailable(item.product, quantity);

  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });
}

// Remove cart item
export async function removeCartItem(itemId: string, userId: string) {
  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cart: { userId },
    },
  });

  if (!item) {
    throw new Error("Article introuvable ou accès refusé");
  }

  await prisma.cartItem.delete({
    where: { id: itemId },
  });

  return {
    message: "Article supprimé du panier",
  };
}