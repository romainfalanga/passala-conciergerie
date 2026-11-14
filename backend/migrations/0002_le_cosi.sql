-- Bien initial : Le Cosi (texte et photos fournis par le client).
-- Surface et tarif laissés vides : à compléter depuis l'espace admin.
INSERT INTO properties(id,name,type,location,short_description,description,capacity,bedrooms,bathrooms,amenities,accepts_pets,direct_booking,published,price_note,airbnb_url,booking_url)
VALUES (
  'le-cosi','Le Cosi','Studio','Six-Fours-les-Plages',
  'Studio idéal pour un couple, entièrement rénové, à deux pas des plages de Six-Fours-les-Plages.',
  'Le Cosi est un studio lumineux entièrement refait à neuf, idéal pour les couples, amis ou voyageurs d''affaires. Il dispose d''un coin salon, d''un espace nuit séparé, d''une cuisine équipée, d''une salle de bain et d''un balcon. Profitez du Wifi, de la TV et d''une place de parking privé. Idéalement situé à proximité des plages, des restaurants et des attractions touristiques. Les animaux de compagnie sont les bienvenus.',
  2,1,1,
  '["Wifi","Télévision","Cuisine équipée","Parking intérieur privé","Balcon","Animaux acceptés"]',
  1,1,1,
  '',
  'https://www.airbnb.fr/rooms/1195368552455371664',
  'https://www.booking.com/hotel/fr/le-cosi-six-fours-les-plages.fr.html'
);
INSERT INTO property_photos(id,property_id,url,alt,position) VALUES
  ('le-cosi-1','le-cosi','images/le-cosi-salon.jpg','Le Cosi, salon',0),
  ('le-cosi-2','le-cosi','images/le-cosi-cuisine.jpg','Le Cosi, cuisine',1),
  ('le-cosi-3','le-cosi','images/le-cosi-chambre.jpg','Le Cosi, espace nuit',2),
  ('le-cosi-4','le-cosi','images/le-cosi-sdb.jpg','Le Cosi, salle de bain',3),
  ('le-cosi-5','le-cosi','images/le-cosi-balcon.jpg','Le Cosi, balcon',4);
