import { prisma } from "../lib/prisma";

interface AddToCartData {
  userId: string;
  productId: string;
  quantity: number;
}

export async function addToCart(
  data: AddToCartData
) {

  const {
    userId,
    productId,
    quantity
  } = data;
  

  if (quantity <= 0) {
  throw new Error(
    "La quantité doit être supérieure à 0"
  );
}

  const product =
  await prisma.product.findUnique({
    where: {
      id: productId
    }
  });

if (!product) {
  throw new Error(
    "Produit introuvable"
  );
}

let cart =
  await prisma.cart.findUnique({
    where: {
      userId
    }
  });

if (!cart) {

  cart = await prisma.cart.create({
    data: {
      userId
    }
  });

}

const existingItem =
  await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId
      }
    }
  });

  if (existingItem) {

  const updatedItem =
    await prisma.cartItem.update({
      where: {
        id: existingItem.id
      },

      data: {
        quantity:
          existingItem.quantity + quantity
      }
    });

  return updatedItem;
}

const cartItem =
  await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity
    }
  });

return cartItem;

}

export async function getCartByUser(
  userId: string
) {

  const cart =
    await prisma.cart.findUnique({
      where: {
        userId
      },

      include: {

        items: {

          include: {

            product: {

              include: {
                images: true
              }

            }

          }

        }

      }

    });


  if (!cart) {

    throw new Error(
      "Panier introuvable"
    );

  }


  return cart;

}

