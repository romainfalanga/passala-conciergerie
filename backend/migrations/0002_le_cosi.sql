-- Only facts and photos present in the exported repository. No invented prices or ratings.
-- Existing bookings were not exported: an administrator must review the calendar first.
INSERT INTO properties(id,name,capacity,accepts_pets,data) VALUES (
  'le-cosi','Le Cosi',2,1,
  '{"type":"Studio","location":"Six-Fours-les-Plages","description":"Le Cosi, un studio pour deux personnes à Six-Fours-les-Plages. Les animaux sont acceptés. Contactez-nous pour préparer votre séjour.","short_description":"Studio pour deux personnes à Six-Fours-les-Plages.","amenities":["Animaux acceptés"],"image_main":"images/le-cosi-salon.jpg","image_gallery_1":"images/le-cosi-cuisine.jpg","image_gallery_2":"images/le-cosi-chambre.jpg","image_gallery_3":"images/le-cosi-sdb.jpg","image_gallery_4":"images/le-cosi-balcon.jpg","direct_booking":true}'
);
