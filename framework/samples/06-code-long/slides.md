---
title: slidedown · 06 · Código largo (todo cabe)
theme: light
transition: fade
---

<!-- ============================================================
  SAMPLE 06 — CÓDIGO LARGO
  El auto-fit ("todo cabe") debe escalar los bloques de código para
  que se vean completos, en vez de recortarlos con un max-height.
  Sin el fix, verify.mjs falla aquí: pre.scrollHeight > pre.clientHeight.
  ============================================================ -->

<!-- slide: layout=default -->
# Código largo — debe verse completo

- Un bloque de código que por sí solo supera la altura útil (592 px) {fragment}
- Si el auto-fit funciona, todo el código se ve escalado, sin recortar {fragment}

```java
public class PaymentProcessor {
  private final Gateway gateway;

  public PaymentProcessor(Gateway gateway) {
    this.gateway = gateway;
  }

  public Receipt process(Order order) {
    validate(order);
    Money amount = order.total();
    Authorization auth = gateway.authorize(amount);
    if (!auth.approved()) {
      throw new PaymentRejectedException(auth.reason());
    }
    return gateway.capture(auth, amount);
  }

  private void validate(Order order) {
    if (order == null) {
      throw new IllegalArgumentException("order");
    }
    if (order.isEmpty()) {
      throw new IllegalStateException("empty order");
    }
  }
}
```

---

<!-- slide: layout=two-cols -->
# Código dentro de una columna

::: col
## Explicación

- El bloque de código vive dentro de una columna
- La columna no debe recortarlo (`overflow: hidden`)
- El auto-fit escala la diapositiva completa para que quepa
- Este último punto también debe verse completo

```java
for (Order order : orders) {
  Receipt r = processor.process(order);
  store.save(r);
}
```
:::

::: col
## Más ejemplos

- Punto A
- Punto B
- Punto C
- Punto D
:::
