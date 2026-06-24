import { prisma } from "../lib/prisma";

interface CreateProductData {
  name: string;
  slug: string;
  description?: string;
  price: number;
  images: string[];
}


// Create a product

export async function createProduct(data: CreateProductData) {

  const {
    name,
    slug,
    description,
    price,
    images
  } = data;


  if (images.length > 3) {
    throw new Error(
      "Maximum 3 images par produit"
    );
  }


  const product = await prisma.$transaction(
    async (tx) => {


      const createdProduct =
        await tx.product.create({
          data: {
            name,
            slug,
            description,
            price,
            currency: "USD",
            type: "LOCAL",

            images: {
              create: images.map(
                (image, index) => ({
                  imageUrl: image,
                  position: index + 1
                })
              )
            },


            inventory: {
              create: {
                quantity: 0
              }
            }
          },


          include: {
            images: true,
            inventory: true
          }
        });


      return createdProduct;

    }
  );


  return product;
}


// Get all active products

export async function getProducts() {

  const products = await prisma.product.findMany({
    where: {
      isActive: true // Ici nous prenons uniquement les produits actifs
    },

    include: {
      images: true,
      inventory: true
    },

    orderBy: {
      createdAt: "desc"
    }
  });


  return products;
}

// Get product details by ID

export async function getProductById(id: string) {

  const product = await prisma.product.findUnique({
    where: {
      id
    },

    include: {
      images: true,
      inventory: true
    }
  });


  if (!product) {
    throw new Error("Produit introuvable");
  }


  return product;
}