"use client";

import { useEffect, useRef } from "react";

/**
 * Chama `fn` agora e a cada `ms`, pausando com a aba em segundo plano e
 * chamando de novo assim que ela volta. Uma chamada por vez: se a anterior
 * não terminou, o tique é pulado em vez de empilhar pedidos na Evolution.
 */
export function usePeriodico(fn: () => Promise<void>, ms: number, ativo = true) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!ativo) return;
    let rodando = false;
    let parado = false;
    const tique = async () => {
      if (rodando || parado || document.visibilityState === "hidden") return;
      rodando = true;
      try {
        await fnRef.current();
      } finally {
        rodando = false;
      }
    };
    void tique();
    const id = setInterval(() => void tique(), ms);
    const aoVoltar = () => document.visibilityState === "visible" && void tique();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ms, ativo]);
}
