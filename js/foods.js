// foods.js — Base local de alimentos comunes (es). kcal por porción indicada.
// Ampliable; el usuario también puede ingresar alimentos manualmente.

export const FOODS = [
  // Desayuno / panadería
  { name: 'Pan (1 rebanada)', kcal: 80, portion: '1 rebanada' },
  { name: 'Pan integral (1 rebanada)', kcal: 70, portion: '1 rebanada' },
  { name: 'Tostada con palta', kcal: 180, portion: '1 tostada' },
  { name: 'Huevo revuelto', kcal: 90, portion: '1 huevo' },
  { name: 'Huevo frito', kcal: 110, portion: '1 huevo' },
  { name: 'Avena cocida', kcal: 150, portion: '1 taza' },
  { name: 'Yogur natural', kcal: 100, portion: '1 vaso' },
  { name: 'Yogur descremado', kcal: 60, portion: '1 vaso' },
  { name: 'Cereal con leche', kcal: 220, portion: '1 tazón' },
  { name: 'Café con leche', kcal: 60, portion: '1 taza' },
  { name: 'Café negro', kcal: 5, portion: '1 taza' },
  { name: 'Mermelada', kcal: 50, portion: '1 cda' },
  { name: 'Mantequilla', kcal: 100, portion: '1 cda' },

  // Frutas
  { name: 'Manzana', kcal: 95, portion: '1 unidad' },
  { name: 'Plátano / Banana', kcal: 105, portion: '1 unidad' },
  { name: 'Naranja', kcal: 62, portion: '1 unidad' },
  { name: 'Pera', kcal: 100, portion: '1 unidad' },
  { name: 'Uvas', kcal: 90, portion: '1 taza' },
  { name: 'Frutillas / Fresas', kcal: 50, portion: '1 taza' },
  { name: 'Palta / Aguacate', kcal: 160, portion: '1/2 unidad' },
  { name: 'Sandía', kcal: 45, portion: '1 taza' },

  // Almuerzo / cena
  { name: 'Arroz blanco cocido', kcal: 200, portion: '1 taza' },
  { name: 'Fideos / Pasta cocida', kcal: 220, portion: '1 taza' },
  { name: 'Papa cocida', kcal: 130, portion: '1 unidad' },
  { name: 'Puré de papas', kcal: 180, portion: '1 taza' },
  { name: 'Pechuga de pollo', kcal: 165, portion: '100 g' },
  { name: 'Carne de vacuno', kcal: 250, portion: '100 g' },
  { name: 'Pescado (merluza)', kcal: 90, portion: '100 g' },
  { name: 'Salmón', kcal: 208, portion: '100 g' },
  { name: 'Atún en agua', kcal: 110, portion: '1 lata' },
  { name: 'Lentejas cocidas', kcal: 230, portion: '1 taza' },
  { name: 'Porotos / Frijoles', kcal: 245, portion: '1 taza' },
  { name: 'Ensalada mixta', kcal: 80, portion: '1 plato' },
  { name: 'Tomate', kcal: 22, portion: '1 unidad' },
  { name: 'Sopa de verduras', kcal: 120, portion: '1 plato' },
  { name: 'Tortilla / Omelette', kcal: 200, portion: '1 unidad' },
  { name: 'Empanada', kcal: 290, portion: '1 unidad' },
  { name: 'Pizza (porción)', kcal: 285, portion: '1 porción' },
  { name: 'Hamburguesa', kcal: 350, portion: '1 unidad' },
  { name: 'Completo / Hot dog', kcal: 300, portion: '1 unidad' },
  { name: 'Sandwich de pollo', kcal: 330, portion: '1 unidad' },

  // Snacks / dulces
  { name: 'Almendras', kcal: 165, portion: '30 g' },
  { name: 'Maní / Cacahuate', kcal: 160, portion: '30 g' },
  { name: 'Galletas (3 u.)', kcal: 150, portion: '3 unidades' },
  { name: 'Chocolate', kcal: 230, portion: '1 barra' },
  { name: 'Helado', kcal: 210, portion: '1 bola' },
  { name: 'Papas fritas (bolsa)', kcal: 280, portion: '1 bolsa' },
  { name: 'Barra de cereal', kcal: 120, portion: '1 unidad' },
  { name: 'Queso', kcal: 110, portion: '30 g' },

  // Bebidas
  { name: 'Bebida / Refresco', kcal: 140, portion: '1 lata' },
  { name: 'Bebida light / zero', kcal: 0, portion: '1 lata' },
  { name: 'Jugo de fruta', kcal: 110, portion: '1 vaso' },
  { name: 'Cerveza', kcal: 150, portion: '1 botella' },
  { name: 'Vino', kcal: 125, portion: '1 copa' },
  { name: 'Leche entera', kcal: 150, portion: '1 vaso' },
  { name: 'Leche descremada', kcal: 80, portion: '1 vaso' },
];
