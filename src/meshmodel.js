// LeoLife – Modelle aus tools/meshy-model.cjs (mit Meshy erzeugt): Base64-Daten werden zu Geometrie mit flachen Flächen.
// Jedes Dreieck hat eine Helligkeit (Eckfarbe in Grau); den Farbton gibt die Instanzfarbe vor.

/** Base64 → ArrayBuffer */
function bytes(b64){ const s=atob(b64), a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a.buffer; }

/**
 * Baut aus einem Modellteil ({pos, index, shade}) eine Geometrie ohne gemeinsame Ecken, damit jede Fläche flach beleuchtet wird.
 * @param {{pos:string,index:string,shade:string}} part
 */
function modelGeometry(part){
  const pos=new Int16Array(bytes(part.pos)), idx=new Uint16Array(bytes(part.index)), shade=new Uint8Array(bytes(part.shade));
  const n=idx.length, P=new Float32Array(n*3), C=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const v=idx[i]*3, s=shade[(i/3)|0]/100;
    P[i*3]=pos[v]/1000; P[i*3+1]=pos[v+1]/1000; P[i*3+2]=pos[v+2]/1000;
    C[i*3]=C[i*3+1]=C[i*3+2]=s;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(P,3));
  g.setAttribute('color',new THREE.BufferAttribute(C,3));
  g.computeVertexNormals();   // ohne Index: Normale je Fläche
  g.computeBoundingSphere();
  return g;
}

export { modelGeometry };
