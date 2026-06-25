import { prisma } from "../lib/prisma";


// Create order from user cart

export async function createOrderFromCart(
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

            product: true

          }

        }

      }

    });



  if (!cart) {

    throw new Error(
      "Panier introuvable"
    );

  }



  if (cart.items.length === 0) {

    throw new Error(
      "Le panier est vide"
    );

  }



  const totalAmount =
    cart.items.reduce(

      (total, item) => {


        const sellingPrice =
          Number(item.product.price) +
          Number(item.product.margin);


        return total +
          sellingPrice *
          item.quantity;


      },

      0

    );




  const order =
    await prisma.$transaction(

      async (tx) => {


        const createdOrder =
          await tx.order.create({


            data: {


              userId,


              totalAmount,


              status:
                "PENDING_PAYMENT",



              items: {


                create:

                cart.items.map(

                  (item) => {


                    const basePrice =
                      Number(item.product.price);



                    const margin =
                      Number(item.product.margin);



                    const sellingPrice =
                      basePrice + margin;



                    return {


                      productId:
                        item.productId,


                      quantity:
                        item.quantity,


                      basePrice,


                      margin,


                      price:
                        sellingPrice


                    };


                  }

                )


              }


            },


            include: {

              items: true

            }


          });



        await tx.cartItem.deleteMany({

          where: {

            cartId: cart.id

          }

        });



        return createdOrder;


      });



  return order;

}


// Get all orders by user

export async function getOrdersByUser(
  userId: string
) {


  const orders =
    await prisma.order.findMany({

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

      },


      orderBy: {

        createdAt: "desc"

      }

    });


  return orders;

}

export async function getOrderById(
  id: string
) {

  const order =
    await prisma.order.findUnique({

      where: {
        id
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

        },

        payment: true,

        trackingEvents: true

      }

    });



  if (!order) {

    throw new Error(
      "Commande introuvable"
    );

  }


  return order;

}