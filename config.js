// Configuración editable de la web.
window.CONFIG = {
  // Lista de invitados. Por defecto se lee el archivo invitados.csv de esta misma carpeta.
  // Opcional: pega aquí el enlace CSV de una hoja de Google publicada
  // (Archivo → Compartir → Publicar en la web → CSV) para editar la lista sin volver a subir la web.
  listaInvitados: './invitados.csv',
};

// Los 8 reinos del mapa. "foco" es el punto del mapa (en %) al que se acerca la cámara;
// "cartel" es la posición del cartel del reino en el mapa (en %), para tocarlo en modo libre.
window.REINOS = {
  muy_muy_lejano:  { nombre: 'Muy Muy|Lejano',             foco: [16, 30], cartel: [14.8, 37.8] },
  duloc:           { nombre: 'Duloc',                      foco: [40, 31], cartel: [39.0, 38.7] },
  dragon:          { nombre: 'Castillo del|Dragón',        foco: [65, 30], cartel: [64.2, 37.8] },
  manzana:         { nombre: 'La Manzana|Envenenada',      foco: [88, 32], cartel: [87.4, 39.1] },
  worcestershire:  { nombre: 'Worcestershire',             foco: [14.5, 68], cartel: [14.2, 75.5] },
  rumpelstiltskin: { nombre: 'Palacio de|Rumpelstiltskin', foco: [37, 69], cartel: [36.6, 75.5] },
  pociones:        { nombre: 'Fábrica de|Pociones',        foco: [60, 70], cartel: [60.4, 76.4] },
  pantano:         { nombre: 'El|Pantano',                 foco: [87, 70], cartel: [86.3, 76.4] },
};
