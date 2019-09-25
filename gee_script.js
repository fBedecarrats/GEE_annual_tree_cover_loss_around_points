var gfc = ee.Image("UMD/hansen/global_forest_change_2018_v1_6");
// add points around which annual forest cover gains and losses will be computed
// points can be loaded from csv or drawn on map
// currently, they must be named treat_villages and control_villages
// point types must be FeatureCollections

// Zoom to the nothern part of the Democratic Republic of Congo
Map.setCenter(11.2616,-2.1790,   8);

// Load Hansen data set and select layers indicating forest loss and gain, respectively
var lossImage   = gfc.select(['loss']);
var gainImage  = gfc.select(['gain']);


// Add the loss layer in red to the Map
Map.addLayer(lossImage.updateMask(lossImage),     {palette: ['FF0000']} ,   'Loss');


// Add the gain layer in blue to the Map
Map.addLayer(gainImage.updateMask(gainImage),    {palette: ['0000FF']} ,   'Gain');


// merge the two feature collections into one
var villages = treat_villages.merge(control_villages);
print(villages,'villages');


// Function for buffering
var bufferer = function(features){  
	return features.buffer(5000,  5);
};

var villagesBuffered = villages.map(bufferer);
Map.addLayer(villagesBuffered,    {opacity: 0.5}, 'villagesBuffered');

var featcol = geometry;

// Lista de 'anios' para la iteracion
var years = ee.List.sequence(0, 17)

// Nombre de la propiedad que contiene el nombre del sitio
var name_sitio = "sitio";

// Obtengo los features localmente (para bucle for)
var sitios = featcol.getInfo()["features"]

// Obtengo el tamaño de la coleccion
var size = featcol.size().getInfo() // para tener el numero de features dentro de la colleccion

// Escala de los pixeles (landsat = 30 m)
var scale = 30
  
// Area de un pixel (900 m2)
var pixarea = scale*scale
  
// Area de bosque (ha) en cada pixel
var treeCover = gfc.select(['treecover2000']);
var areaCover = treeCover.divide(100).multiply(pixarea)// modif here
               .divide(10000) // convierto a hectareas
               .select([0],["areacover"])// rename band
  
// area total de perdida
var loss = gfc.select(['loss']);
var areaLoss = loss.gt(0) // mascara de perdida
              .multiply(areaCover) // multiplica la mascara por el area de cobertura
              .select([0],["arealoss"]);
  
// total gain area
var gain = gfc.select(['gain'])
var areaGain = gain.gt(0) // mascara de ganancia
              .multiply(areaCover) // multiplica la mascara por el area de cobertura
              .select([0],["areagain"]);
  
// Imagen final
var total = gfc.select("lossyear")
            .addBands(areaCover)
            .addBands(areaLoss)
            .addBands(areaGain)
  
// Map.addLayer(total,{},"total")

// Itero sobre cada feature
for (var n=0; n<size; n++) { //n++ -> n+1
  
  // Nombre del sitio
  var ns = sitios[n]["properties"][name_sitio]
  
  // Filtro solo el sitio
  var feat = ee.Feature(sitios[n])
  
  // Creo dos colecciones con diferente 'type' ('gain' y 'loss')
  var featgain = feat.set("type", "gain")
  var featloss = feat.set("type", "loss")
  
  // Cobertura inicial por Feature
  
  var cover = areaCover.reduceRegion({
    geometry: feat.geometry(),
    reducer: ee.Reducer.sum(),
    scale: scale,
    maxPixels: 1e13
  }).get("areacover")
  
  print("area total de cobertura en "+ns, cover)
  // Funcion para agregar a cada Feature las perdidas
  // y ganancias para cada anio
  
  var addVar = function(name) {
    
    var areaName = "area"+name
    
    var wrap = function(feature) {
    
      // Funcion para iterar anio a anio perdidas y ganancias
      var addVarYear = function(year, feat) {
        // cast variables
        feat = ee.Feature(feat)
        
        // La var 'year' va coincidiendo con la banda 'lossyear'
        year = ee.Number(year).toInt() // convierto a entero
        
        // Anio 'completo' para escribir en las propiedades
        var actual_year = ee.Number(2000).add(year)
    
        // Con la var 'year' filtro el anio usando la banda 'lossyear'
        
        // 1ro: obtengo la mascara
        var filtered = total.select("lossyear").eq(year)
        
        // 2do: aplico la mascara
        filtered = total.updateMask(filtered)
        
        // Ahora la imagen solo contiene datos en el 'year'
        // Por lo tanto sumo los valores
        var reduc = filtered.reduceRegion({
          geometry: feature.geometry(),
          reducer: ee.Reducer.sum(),
          scale: scale
        }).get(areaName)
    
        // Convierto los resultados en numeros
        // Por lo tanto, 'loss' va a ser la cantidad de ha que se
        // perdieron el anio 'year' en el feature 'feature' (recordar que es una iteracion)
        var lg = ee.Number(reduc)
    
        // Nombres para agregar a las propiedades
        // var namelg = nameEE.cat(ee.String("_")).cat(actual_year)
        var namelg = ee.String(actual_year)
        
        // Si la perdida o ganancia es mayor a 0 --> 1, sino --> 0
        var cond = loss.gt(0).or(gain.gt(0))
        
        // Agrega la propiedad al feature solo si hay perdida o ganancia
        return ee.Algorithms.If(cond, 
                                feat.set(namelg, lg),
                                feat)
      }
    
      // Iteracion usando la funcion addVarYear tomando como punto 
      // inicial el feature actual
      var newfeat = ee.Feature(years.iterate(addVarYear, feature))
    
      // La funcion addVar devuelve el feature con las propiedades
      // agregadas
      return newfeat
    }
    return wrap
  }
  
  // Itero sobre el FeatureCollection
  var areas_gain = addVar("gain")(featgain)
  var areas_loss = addVar("loss")(featloss)
  
//  Map.addLayer(areas_gain, {}, "areas gain "+ns)
//  Map.addLayer(areas_loss, {}, "areas loss "+ns)
  
  //var areas = areas_gain.merge(areas_loss)
  var areas = ee.FeatureCollection([areas_gain, areas_loss])
  
  // GRAFICO LOS RESULTADOS
  
  var actual_years = years.map(function(n){
    return  ee.Number(2000).add(ee.Number(n).toInt()).format()
  })
  
  var char = ui.Chart.feature.byProperty(areas, actual_years.getInfo(), "type")
               .setOptions({title:'Gains et pertes de couvert forestier: village '+ns,
                            hAxis: {title: 'Année'},
                            vAxis: {title: 'Hectares'},
               })
  
  print(char)
}
